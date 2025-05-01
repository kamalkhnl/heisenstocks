document.addEventListener('DOMContentLoaded', function() {
    console.log('DOM Content Loaded');
    const chartContainer = document.getElementById('container');
    console.log('Chart container:', chartContainer);
    const searchOverlay = document.getElementById('search-overlay');
    const searchInput = document.getElementById('chart-search');
    const suggestionsContainer = document.getElementById('search-suggestions');
    console.log('Initializing chart with lightweight-charts:', typeof LightweightCharts);
    const { createChart, AreaSeries, CandlestickSeries, HistogramSeries } = LightweightCharts;
    let chart;
    let candlestickSeries;
    let squeezeHistogram;
    let squeezeDots;
    let smaManager;
    let selectedIndex = 0;
    let suggestions = [];
    const MAIN_PANE_RATIO = 0.8; // 70% for main chart, 30% for indicator

    function applyPaneLayout() {
        if (!chart) return;
        
        const panes = chart.panes();
        if (panes && panes.length > 1) {
            const totalHeight = chartContainer.clientHeight;
            const mainPaneHeight = Math.floor(totalHeight * MAIN_PANE_RATIO);
            const indicatorPaneHeight = totalHeight - mainPaneHeight;
            
            // Set heights explicitly for both panes
            panes[0].setHeight(mainPaneHeight);
            panes[1].setHeight(indicatorPaneHeight);
        }
    }

    async function loadSymbolData(type, id) {
        try {
            const response = await fetch(`/charts/api/data?type=${type}&id=${id}`);
            const data = await response.json();
            
            if (data && data.length > 0) {
                const chartData = data.map(item => ({
                    time: item.time,
                    open: parseFloat(item.open),
                    high: parseFloat(item.high),
                    low: parseFloat(item.low),
                    close: parseFloat(item.close || item.value)
                }));

                // Initialize and calculate squeeze momentum
                const squeezeIndicator = new SqueezeIndicator();
                const squeezeData = squeezeIndicator.calculate(chartData);

                candlestickSeries.setData(chartData);

                // Update SMA data
                smaManager.updateData(chartData);

                const histogramData = squeezeData.map(item => ({
                    time: item.time,
                    value: item.value,
                    color: getHistogramColor(item)
                }));

                const dotsData = squeezeData.map(item => ({
                    time: item.time,
                    value: 0,
                    color: getSqueezeStateColor(item)
                }));

                squeezeHistogram.setData(histogramData);
                squeezeDots.setData(dotsData);

                // Set time range to last year
                if (chartData.length > 0) {
                    const lastDataPoint = chartData[chartData.length - 1].time;
                    const oneYearAgo = new Date();
                    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
                    
                    const yearAgoIndex = chartData.findIndex(item => {
                        const itemDate = new Date(item.time);
                        return itemDate >= oneYearAgo;
                    });

                    if (yearAgoIndex !== -1) {
                        const timeScale = chart.timeScale();
                        timeScale.setVisibleRange({
                            from: chartData[yearAgoIndex].time,
                            to: lastDataPoint
                        });
                        
                        setTimeout(() => {
                            const visibleLogicalRange = timeScale.getVisibleLogicalRange();
                            if (visibleLogicalRange) {
                                timeScale.setVisibleLogicalRange({
                                    from: visibleLogicalRange.from,
                                    to: visibleLogicalRange.to + 20
                                });
                            }
                            applyPaneLayout();
                        }, 50);
                    }
                }
            }
        } catch (error) {
            console.error('Error loading symbol data:', error);
        }
    }

    async function searchSymbols(query) {
        try {
            const response = await fetch('/charts/api/companies');
            const data = await response.json();
            
            if (!query) return data;
            
            query = query.toLowerCase();
            return data.filter(item => 
                item.symbol.toLowerCase().includes(query) || 
                item.name.toLowerCase().includes(query)
            );
        } catch (error) {
            console.error('Error searching symbols:', error);
            return [];
        }
    }

    function renderSuggestions(items) {
        suggestions = items;
        selectedIndex = 0;
        
        suggestionsContainer.innerHTML = items.map((item, index) => `
            <div class="suggestion-item ${index === 0 ? 'selected' : ''}" data-index="${index}">
                <span class="suggestion-symbol">${item.symbol}</span>
                <span class="suggestion-name">${item.isIndex ? 'Index' : item.name}</span>
            </div>
        `).join('');
        
        suggestionsContainer.classList.toggle('hidden', items.length === 0);
    }

    function handleSelection(item) {
        if (!item) return;
        
        hideSearch();  // Hide search immediately when selection is made
        loadSymbolData(item.isIndex ? 'index' : 'company', item.isIndex ? item.id : item.id);
    }

    let debounceTimeout;
    searchInput.addEventListener('input', async (e) => {
        clearTimeout(debounceTimeout);
        debounceTimeout = setTimeout(async () => {
            const results = await searchSymbols(e.target.value);
            renderSuggestions(results);
        }, 300);
    });

    searchInput.addEventListener('keydown', (e) => {
        if (suggestions.length === 0) return;
        
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            selectedIndex = (selectedIndex + 1) % suggestions.length;
            const items = suggestionsContainer.querySelectorAll('.suggestion-item');
            items.forEach((item, i) => {
                item.classList.toggle('selected', i === selectedIndex);
            });
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            selectedIndex = (selectedIndex - 1 + suggestions.length) % suggestions.length;
            const items = suggestionsContainer.querySelectorAll('.suggestion-item');
            items.forEach((item, i) => {
                item.classList.toggle('selected', i === selectedIndex);
            });
        } else if (e.key === 'Enter') {
            e.preventDefault();
            handleSelection(suggestions[selectedIndex]);
        }
    });

    searchInput.addEventListener('keyup', (e) => {
        if (e.key === 'Backspace' && !searchInput.value) {
            hideSearch();
        }
    });

    suggestionsContainer.addEventListener('click', (e) => {
        const item = e.target.closest('.suggestion-item');
        if (!item) return;
        
        const index = parseInt(item.dataset.index);
        handleSelection(suggestions[index]);
    });

    // Hide suggestions when clicking outside
    document.addEventListener('click', (e) => {
        if (!searchInput.contains(e.target) && !suggestionsContainer.contains(e.target)) {
            suggestionsContainer.classList.add('hidden');
        }
    });

    function showSearch() {
        searchOverlay.classList.remove('hidden');
        searchInput.focus();
    }

    function hideSearch() {
        searchOverlay.classList.add('hidden');
        searchInput.value = '';
        suggestionsContainer.classList.add('hidden');
        // Remove focus from search input to ensure keyboard events work again
        searchInput.blur();
        // Reset any active element to ensure keyboard events are captured
        if (document.activeElement instanceof HTMLElement) {
            document.activeElement.blur();
        }
    }

    function initChart() {
        console.log('Initializing chart with dimensions:', {
            width: chartContainer.clientWidth,
            height: chartContainer.clientHeight
        });
        const chartOptions = {
            width: chartContainer.clientWidth,
            height: chartContainer.clientHeight,
            layout: {
                textColor: 'white',
                background: { type: 'solid', color: '#131722' },
                panes: {
                    separatorColor: '#f22c3d',
                    separatorHoverColor: 'rgba(255, 0, 0, 0.1)',
                    separatorLineWidth: 3,
                    enableResize: false  // Disable manual resizing to maintain ratio
                }
            },
            grid: {
                vertLines: { 
                    color: 'rgba(255, 255, 255, 0.1)',
                    style: 1,
                    visible: true
                },
                horzLines: { 
                    color: 'rgba(255, 255, 255, 0.1)',
                    style: 1,
                    visible: true
                }
            },
            timeScale: {
                timeVisible: true,
                secondsVisible: false,
                barSpacing: 5,
            }
        };

        try {
            chart = createChart(chartContainer, chartOptions);
            console.log('Chart created successfully');
            chart.timeScale().applyOptions({rightOffset: 10});

            // Handle window resizing
            function handleResize() {
                const width = chartContainer.clientWidth;
                const height = chartContainer.clientHeight;
                
                chart.applyOptions({
                    width: width,
                    height: height,
                });
                
                // Force layout update after resize
                applyPaneLayout();
            }

            // Add resize observer for more reliable size changes detection
            const resizeObserver = new ResizeObserver(() => {
                handleResize();
            });
            resizeObserver.observe(chartContainer);

            // Also keep the window resize event for backup
            window.addEventListener('resize', handleResize);

            // Create candlestick series
            candlestickSeries = chart.addSeries(
                CandlestickSeries,
                {
                    upColor: '#26a69a',
                    downColor: '#ef5350',
                    borderVisible: false,
                    wickUpColor: '#26a69a',
                    wickDownColor: '#ef5350'
                },
                0  // Main pane
            );

            // Initialize SMA manager
            smaManager = new SMAChartManager(chart, 0);
            // Add default SMAs
            smaManager.addSMA(20, '#2962FF');  // Blue
            smaManager.addSMA(50, '#FF6D00');  // Orange
            smaManager.addSMA(200, '#E91E63'); // Pink

            // Create histogram series for squeeze momentum
            squeezeHistogram = chart.addSeries(HistogramSeries, {
                color: '#26a69a',
                base: 0,
                lineWidth: 4,
            }, 1);  // Bottom pane

            // Create dot series for squeeze state
            squeezeDots = chart.addSeries(HistogramSeries, {
                color: 'blue',
                base: 0,
                lineWidth: 2,
            }, 1);

            // Load initial data based on URL parameters
            const params = new URLSearchParams(window.location.search);
            const type = params.get('type') || 'index';
            const id = params.get('id') || 'NEPSE Index';
            loadSymbolData(type, id);

            return chart;
        } catch (error) {
            console.error('Error creating chart:', error);
        }
    }

    function getHistogramColor(item) {
        switch(item.momentum) {
            case 'strong_up':
                return '#00ff00';  // Bright green
            case 'weak_up':
                return '#008000';  // Dark green
            case 'strong_down':
                return '#ff0000';  // Bright red
            case 'weak_down':
                return '#800000';  // Dark red
            default:
                return '#808080';  // Gray
        }
    }

    function getSqueezeStateColor(item) {
        if (item.sqzOn) return '#000000';  // Black for squeeze
        if (item.sqzOff) return '#808080'; // Gray for no squeeze
        return '#0000ff';                  // Blue for neither
    }

    function initSearch() {
        // Show search on any keypress except for special keys
        const handleKeydown = (e) => {
            // Don't trigger if user is typing in an input or textarea
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
            
            // Ignore special keys and key combinations
            if (e.ctrlKey || e.altKey || e.metaKey) return;
            if (e.key === 'Escape' || e.key === 'Tab' || e.key === 'Control' || 
                e.key === 'Alt' || e.key === 'Shift' || e.key === 'Meta' ||
                e.key === 'CapsLock' || e.key === 'NumLock' || e.key === 'ScrollLock' ||
                e.key.startsWith('Arrow') || e.key.startsWith('Page') || 
                e.key.startsWith('F') || e.key === 'Insert' || e.key === 'Delete' ||
                e.key === 'Home' || e.key === 'End') {
                return;
            }

            showSearch();
            
            // If it's a printable character, set it as the search value
            if (e.key.length === 1) {
                e.preventDefault();
                searchInput.value = e.key;
                const event = new Event('input');
                searchInput.dispatchEvent(event);
            }
        };

        // Remove existing event listeners if any
        window.removeEventListener('keydown', handleKeydown);
        
        // Add the event listener
        window.addEventListener('keydown', handleKeydown);

        // Always listen for the '/' key to open search
        window.addEventListener('keydown', (e) => {
            if (e.key === '/' && document.activeElement !== searchInput) {
                e.preventDefault();
                showSearch();
            }
        });

        // Hide search when pressing Escape
        window.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                hideSearch();
            }
        });
    }

    if (chartContainer) {
        console.log('Starting chart initialization');
        initChart();
        initSearch();  // Initialize search immediately
    } else {
        console.error('Chart container not found');
    }
});