document.addEventListener('DOMContentLoaded', function() {
    const chartContainer = document.getElementById('container');
    const searchOverlay = document.getElementById('search-overlay');
    const searchInput = document.getElementById('chart-search');
    const suggestionsContainer = document.getElementById('search-suggestions');
    const activeIndicatorsContainer = document.getElementById('active-indicators');
    console.log('Initializing chart with lightweight-charts:', typeof LightweightCharts);
    const { createChart, AreaSeries, CandlestickSeries, HistogramSeries, LineSeries } = LightweightCharts;
    
    let chart;
    let candlestickSeries;
    let selectedIndex = 0;
    let suggestions = [];
    let currentSymbolInfo = null;
    window.currentChartData = null; // Make currentChartData globally accessible
    let indicatorInstances = [];
    // Track explicitly removed indicators by ID instead of by type
    window.removedIndicatorIds = window.removedIndicatorIds || new Set();
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

    function updateSymbolDisplay(type, id, name) {
        currentSymbolInfo = { type, id, name };
        const symbolDisplay = document.getElementById('current-symbol');
        const nameDisplay = document.getElementById('current-name');
        if (symbolDisplay && nameDisplay) {
            symbolDisplay.textContent = id;
            nameDisplay.textContent = name || (type === 'index' ? 'Index' : '');
            // Make both elements visible
            symbolDisplay.style.display = 'block';
            nameDisplay.style.display = 'block';
        }
    }

    async function loadSymbolData(type, id) {
        try {
            const response = await fetch(`/charts/api/data?type=${type}&id=${id}`);
            const data = await response.json();
            
            if (data && data.length > 0) {
                // Update symbol display with the correct symbol and name
                updateSymbolDisplay(type, data[0].symbol || id, data[0].name || (type === 'index' ? 'Index' : ''));
                
                const chartData = data.map(item => ({
                    time: item.time,
                    open: parseFloat(item.open),
                    high: parseFloat(item.high),
                    low: parseFloat(item.low),
                    close: parseFloat(item.close || item.value)
                }));

                // Save indicator configurations but don't create new instances yet
                const indicatorConfigs = [];
                
                // Save all indicator instances including duplicates of the same type
                indicatorInstances.forEach(indicator => {
                    indicatorConfigs.push({
                        type: indicator.type,
                        settings: JSON.parse(JSON.stringify(indicator.settings)),
                        id: indicator.id || Math.random().toString(36).substring(2, 10) // Preserve or create unique ID
                    });
                });
                
                // IMPORTANT: Clear all existing indicators from the UI
                document.getElementById('active-indicators').innerHTML = '';
                
                // Clear the global indicator instances array
                indicatorInstances = [];
                
                // Completely recreate the chart with the same options
                if (chart) {
                    // Store current chart dimensions and options
                    const width = chartContainer.clientWidth;
                    const height = chartContainer.clientHeight;

                    // Remove old chart completely to clean up all series and event handlers
                    chart.remove();
                    
                    // Create new chart with the same options
                    chart = createChart(chartContainer, {
                        width: width,
                        height: height,
                        layout: {
                            textColor: 'white',
                            background: { type: 'solid', color: '#131722' },
                            panes: {
                                separatorColor: '#f22c3d',
                                separatorHoverColor: 'rgba(255, 0, 0, 0.1)',
                                separatorLineWidth: 3,
                                enableResize: false
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
                    });
                    
                    // Set right offset
                    chart.timeScale().applyOptions({rightOffset: 10});
                    
                    // Add second pane if we had indicators that need it
                    if (indicatorConfigs.some(ind => ind.type === 'squeeze-momentum')) {
                        try {
                            // Only add secondary pane if we have indicators that need it
                            if (typeof chart.addPane === 'function') {
                                const mainPaneHeight = Math.floor(height * MAIN_PANE_RATIO);
                                const secondaryPaneHeight = height - mainPaneHeight;
                                chart.addPane({ height: secondaryPaneHeight });
                            }
                        } catch (e) {
                            console.warn('Could not create secondary pane:', e);
                        }
                    }
                    
                    // Add candlestick series to new chart
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
                    
                    // Set data for candlestick series
                    candlestickSeries.setData(chartData);
                    
                    // Store the chart data globally
                    window.currentChartData = chartData;
                    
                    // Now that chart is fully set up, recreate indicators one by one
                    for (const config of indicatorConfigs) {
                        // Skip recreating indicators that were explicitly removed
                        if (window.removedIndicatorIds.has(config.id)) continue;

                        // Create a new indicator with skipInit=true to prevent automatic initialization
                        const newIndicator = new Indicator(chart, config.type, true);
                        
                        // Copy settings before creating UI element or series
                        for (const key in config.settings) {
                            if (newIndicator.settings[key]) {
                                newIndicator.settings[key] = JSON.parse(JSON.stringify(config.settings[key]));
                            }
                        }
                        
                        // Add to global array
                        indicatorInstances.push(newIndicator);
                        
                        // Instead of calling init directly, call our special method for recreation
                        recreateIndicator(newIndicator);
                    }
                    
                    // Apply pane layout after all indicators are created
                    applyPaneLayout();
                }
            }
        } catch (error) {
            console.error('Error loading symbol data:', error);
        }
    }
    
    // Helper function to properly recreate indicators
    function recreateIndicator(indicator) {
        try {
            // Make sure the series array is cleared
            indicator.series = [];
            
            // Initialize indicator without creating UI element
            if (indicator.type === 'sma') {
                const { LineSeries } = LightweightCharts;
                indicator.series.push(chart.addSeries(LineSeries, {
                    color: indicator.settings.sma.color,
                    lineWidth: 2,
                    title: `MA ${indicator.settings.sma.period}`
                }, 0));
            } else if (indicator.type === 'squeeze-momentum') {
                const { HistogramSeries } = LightweightCharts;
                
                // Add series to pane 1
                indicator.series.push(chart.addSeries(HistogramSeries, {
                    color: indicator.settings['squeeze-momentum'].strongUpColor,
                    base: 0,
                    lineWidth: 4,
                    title: 'Squeeze Mo'
                }, 1));
                
                indicator.series.push(chart.addSeries(HistogramSeries, {
                    color: 'blue',
                    base: 0,
                    lineWidth: 2,
                    title: 'Squeeze'
                }, 1));
            }
            
            // Create UI element
            indicator.createIndicatorElement();
            
            // Update with data
            if (window.currentChartData) {
                indicator.updateData(window.currentChartData);
            }
        } catch (e) {
            console.error("Error recreating indicator:", e);
            
            // Remove from global array if initialization failed
            const index = indicatorInstances.indexOf(indicator);
            if (index > -1) {
                indicatorInstances.splice(index, 1);
            }
        }
    }

    async function searchSymbols(query) {
        try {
            const response = await fetch('/charts/api/companies');
            const data = await response.json();
            
            if (!query) return data;
            
            query = query.toLowerCase();
            return data.filter(item => {
                const symbol = item.symbol.toLowerCase();
                const name = (item.name || '').toLowerCase();
                
                // Exact symbol match has highest priority
                if (symbol === query) return true;
                
                // Symbol starts with query
                if (symbol.startsWith(query)) return true;
                
                // Only then check if name contains query
                if (name.includes(query)) return true;
                
                // Finally, check if symbol contains query, but with lower priority
                // Only include if it's part of a word boundary
                const symbolWords = symbol.split(/[\s-_.]+/);
                return symbolWords.some(word => word.startsWith(query));
            });
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
        // For both companies and indices, use the symbol
        loadSymbolData(item.isIndex ? 'index' : 'company', item.symbol);
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

            // Load initial data based on URL parameters
            const params = new URLSearchParams(window.location.search);
            const type = params.get('type') || 'index';
            const id = params.get('id') || 'NEPSE Index';
            // For companies, check if the ID is actually a symbol
            if (type === 'company') {
                loadSymbolData(type, id.toUpperCase());  // Convert to uppercase to match symbol format
            } else {
                loadSymbolData(type, id);
            }

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

    function updateChartData(chartData) {
        if (!chartData || !candlestickSeries) return;
        window.currentChartData = chartData;  // Update the global reference

        // Ensure candlestick series is updated
        requestAnimationFrame(() => {
            candlestickSeries.setData(chartData);
            // Update indicators after candlesticks are set
            indicatorInstances.forEach(indicator => {
                indicator.updateData(chartData);
            });
        });
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

    // Initialize indicators
    function initIndicators() {
        const indicatorItems = document.querySelectorAll('.indicator-item');
        const dropdown = document.querySelector('.dropdown');
        const dropdownBtn = dropdown.querySelector('.dropdown-btn');
        const dropdownContent = dropdown.querySelector('.dropdown-content');
        
        // Toggle dropdown on button click
        dropdownBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            dropdownContent.classList.toggle('show');
        });
        
        // Add click event listeners to indicator items
        indicatorItems.forEach(item => {
            item.addEventListener('click', function(e) {
                e.stopPropagation(); // Prevent dropdown from closing
                const indicatorType = this.getAttribute('data-indicator');
                
                // Create new indicator instance
                const indicatorInstance = new Indicator(chart, indicatorType);
                
                // If this indicator type was previously removed, remove it from the removed list
                if (window.removedIndicatorIds.has(indicatorInstance.id)) {
                    window.removedIndicatorIds.delete(indicatorInstance.id);
                }
                
                indicatorInstances.push(indicatorInstance);
                
                // Update chart with current data
                if (window.currentChartData) {
                    updateChartData(window.currentChartData);
                }
            });
        });
        
        // Close dropdown when clicking outside
        document.addEventListener('click', function(e) {
            if (!dropdown.contains(e.target)) {
                dropdownContent.classList.remove('show');
            }
        });
    }

    if (chartContainer) {
        console.log('Starting chart initialization');
        initChart();
        initSearch();  // Initialize search immediately
        initIndicators();  // Initialize indicators
    } else {
        console.error('Chart container not found');
    }
});