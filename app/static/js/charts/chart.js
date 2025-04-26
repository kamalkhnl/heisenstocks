/**
 * Charts functionality for the Stonks application
 * Main features:
 * - Interactive stock/index charts using Lightweight Charts
 * - Chart type toggle (candlestick/line)
 * - Volume display for company data
 * - TradingView-like symbol search
 * - Technical indicators (SMA, RSI)
 */

document.addEventListener('DOMContentLoaded', function() {
    // Check if library loaded
    if (typeof LightweightCharts === 'undefined') {
        console.error('LightweightCharts library not loaded!');
        document.getElementById('chartContainer').innerHTML = 
            '<div class="chart-error">Chart library failed to load. Please refresh the page.</div>';
        return;
    }
    
    // Main elements
    const chartContainer = document.getElementById('chartContainer');
    const volumeChartContainer = document.getElementById('volumeChartContainer');
    const chartTitle = document.getElementById('chartTitle');
    const lineChartBtn = document.getElementById('lineChart');
    const candleChartBtn = document.getElementById('candleChart');
    const volumeValueDisplay = document.getElementById('volumeValue');
    const volumeDataContainer = document.querySelector('.volume-data');
    const indicatorsContainer = document.getElementById('indicatorsContainer');
    const indicatorsMenu = document.getElementById('indicatorsMenu');
    
    // Search elements
    const chartSearchContainer = document.getElementById('chartSearchContainer');
    const chartSearchInput = document.getElementById('chartSearchInput');
    const chartSearchResults = document.getElementById('chartSearchResults');
    const searchHint = document.getElementById('searchHint');
    
    // Legend elements
    const openValue = document.getElementById('openValue');
    const highValue = document.getElementById('highValue');
    const lowValue = document.getElementById('lowValue');
    const closeValue = document.getElementById('closeValue');
    const changeValue = document.getElementById('changeValue');
    const changePercent = document.getElementById('changePercent');
    const turnoverValue = document.getElementById('turnoverValue');
    
    // Chart variables
    let chart = null;
    let volumeChart = null;
    let mainSeries = null;
    let volumeSeries = null;
    let lastData = [];
    let chartType = 'candlestick'; // Default to candlestick
    let activeDays = 0; // Default to ALL
    let currentSymbolType = 'index';
    let currentSymbolId = 'NEPSE Index';
    let allCompanies = []; // Store all companies for search
    let activeSearchIndex = -1; // Currently selected search result index
    let activeIndicators = {}; // Store active indicators
    
    // Fetch company data for search functionality
    fetchCompanyData();
    
    // Initialize charts
    createCharts();
    
    // Setup keyboard handling for direct chart search
    setupChartSearch();
    
    // Load default data
    loadChartData(currentSymbolType, currentSymbolId);
    
    // Fetch turnover data
    fetchTurnoverData();
    
    // Setup indicators menu
    setupIndicatorsMenu();
    
    // Chart type toggle
    lineChartBtn.addEventListener('click', function() {
        if (chartType !== 'line') {
            chartType = 'line';
            lineChartBtn.classList.add('active');
            candleChartBtn.classList.remove('active');
            
            // Reload chart
            loadChartData(currentSymbolType, currentSymbolId);
        }
    });
    
    candleChartBtn.addEventListener('click', function() {
        if (chartType !== 'candlestick') {
            chartType = 'candlestick';
            candleChartBtn.classList.add('active');
            lineChartBtn.classList.remove('active');
            
            // Reload chart
            loadChartData(currentSymbolType, currentSymbolId);
        }
    });
    
    // Create or reset the charts
    function createCharts() {
        // Clear existing charts
        if (chart) {
            chart.remove();
            chart = null;
        }
        
        if (volumeChart) {
            volumeChart.remove();
            volumeChart = null;
        }
        
        // Adjust main chart container height if showing volume
        const chartHeight = currentSymbolType === 'company' ? 
            chartContainer.clientHeight - volumeChartContainer.clientHeight : 
            chartContainer.clientHeight;
        
        // Create main chart
        chart = LightweightCharts.createChart(chartContainer, {
            width: chartContainer.clientWidth,
            height: chartHeight,
            layout: {
                background: { type: 'solid', color: 'transparent' },
                textColor: '#a2a0b3',
            },
            grid: {
                vertLines: { color: 'rgba(42, 46, 57, 0.2)' },
                horzLines: { color: 'rgba(42, 46, 57, 0.2)' },
            },
            timeScale: {
                timeVisible: true,
                secondsVisible: false,
                borderColor: 'rgba(197, 203, 206, 0.1)',
            },
            crosshair: {
                mode: LightweightCharts.CrosshairMode.Normal,
            },
            rightPriceScale: {
                borderColor: 'rgba(197, 203, 206, 0.1)',
                scaleMargins: {
                    top: 0.1,
                    bottom: 0.1,
                },
            },
            handleScroll: {
                vertTouchDrag: false,
            },
        });
        
        // Create volume chart if showing company data
        if (currentSymbolType === 'company') {
            volumeChartContainer.style.display = 'block';
            volumeChart = LightweightCharts.createChart(volumeChartContainer, {
                width: volumeChartContainer.clientWidth,
                height: volumeChartContainer.clientHeight,
                layout: {
                    background: { type: 'solid', color: 'transparent' },
                    textColor: '#a2a0b3',
                },
                grid: {
                    vertLines: { color: 'transparent' },
                    horzLines: { color: 'rgba(42, 46, 57, 0.2)' },
                },
                timeScale: {
                    visible: false,
                },
                rightPriceScale: {
                    borderColor: 'rgba(197, 203, 206, 0.1)',
                    scaleMargins: {
                        top: 0.1,
                        bottom: 0.2,
                    },
                },
                handleScroll: false,
                handleScale: false,
            });
            
            // Sync the time scales
            chart.timeScale().subscribeVisibleTimeRangeChange(() => {
                const timeScaleRange = chart.timeScale().getVisibleRange();
                if (timeScaleRange !== null && volumeChart) {
                    try {
                        volumeChart.timeScale().setVisibleRange(timeScaleRange);
                    } catch (syncErr) {
                        console.error("Error setting volume chart visible range:", syncErr);
                    }
                }
            });
        } else {
            volumeChartContainer.style.display = 'none';
        }
        
        // Handle window resize
        window.addEventListener('resize', function() {
            if (chart) {
                const chartHeight = currentSymbolType === 'company' ? 
                    chartContainer.clientHeight - volumeChartContainer.clientHeight : 
                    chartContainer.clientHeight;
                    
                chart.applyOptions({
                    width: chartContainer.clientWidth,
                    height: chartHeight,
                });
            }
            if (volumeChart) {
                volumeChart.applyOptions({
                    width: volumeChartContainer.clientWidth,
                    height: volumeChartContainer.clientHeight,
                });
            }
        });
        
        return { chart, volumeChart };
    }
    
    // Fetch total market turnover data
    function fetchTurnoverData() {
        // Build API URL to get all indices for latest date
        fetch('/charts/api/data?type=index&id=NEPSE Index')
            .then(response => {
                if (!response.ok) {
                    throw new Error(`HTTP error! Status: ${response.status}`);
                }
                return response.json();
            })
            .then(data => {
                if (data.length === 0) {
                    turnoverValue.textContent = 'No data available';
                    return;
                }
                
                // Get the latest date from NEPSE Index data
                const latestData = data[data.length - 1];
                const latestDate = latestData.time;
                
                // Now fetch data for all indices for this date
                fetch('/charts/api/turnover?date=' + latestDate)
                    .then(response => {
                        if (!response.ok) {
                            throw new Error(`HTTP error! Status: ${response.status}`);
                        }
                        return response.json();
                    })
                    .then(turnoverData => {
                        if (turnoverData && turnoverData.totalTurnover) {
                            // Format with commas and display in millions/billions
                            const turnover = turnoverData.totalTurnover;
                            let formattedTurnover;
                            
                            if (turnover >= 1000000000) {
                                formattedTurnover = (turnover / 1000000000).toFixed(2) + ' B';
                            } else if (turnover >= 1000000) {
                                formattedTurnover = (turnover / 1000000).toFixed(2) + ' M';
                            } else if (turnover >= 1000) {
                                formattedTurnover = (turnover / 1000).toFixed(2) + ' K';
                            } else {
                                formattedTurnover = turnover.toLocaleString();
                            }
                            
                            turnoverValue.textContent = 'Rs. ' + formattedTurnover;
                        } else {
                            turnoverValue.textContent = 'No turnover data';
                        }
                    })
                    .catch(error => {
                        console.error('Error fetching turnover data:', error);
                        turnoverValue.textContent = 'Error loading turnover data';
                    });
            })
            .catch(error => {
                console.error('Error fetching index data:', error);
                turnoverValue.textContent = 'Error loading data';
            });
    }
    
    // Format volume for display
    function formatVolume(volume) {
        if (volume >= 1000000) {
            return (volume / 1000000).toFixed(2) + 'M';
        } else if (volume >= 1000) {
            return (volume / 1000).toFixed(2) + 'K';
        } else {
            return volume.toString();
        }
    }
    
    // Load chart data from API
    function loadChartData(type, id) {
        // Clear any existing error messages first
        const existingErrors = chartContainer.querySelectorAll('.chart-error');
        existingErrors.forEach(el => el.remove());
        
        // Make sure we remove any existing loading indicators before adding a new one
        const existingLoading = chartContainer.querySelectorAll('.chart-loading');
        existingLoading.forEach(el => el.remove());
        
        // Show loading indicator
        const loadingElement = document.createElement('div');
        loadingElement.className = 'chart-loading';
        loadingElement.innerHTML = '<div class="spinner-border text-secondary" role="status"><span class="visually-hidden">Loading...</span></div>';
        chartContainer.appendChild(loadingElement);
        
        // Reset legend values
        openValue.textContent = '-';
        highValue.textContent = '-';
        lowValue.textContent = '-';
        closeValue.textContent = '-';
        changeValue.textContent = '-';
        changePercent.textContent = '-';
        volumeValueDisplay.textContent = '-';
        
        // Build API URL with or without date range
        let apiUrl = `/charts/api/data?type=${type}&id=${id}`;
        
        // If activeDays is set and not 0 (ALL), calculate the from date
        if (activeDays > 0) {
            const toDate = new Date();
            const fromDate = new Date();
            fromDate.setDate(fromDate.getDate() - activeDays);
            
            apiUrl += `&from_date=${fromDate.toISOString().split('T')[0]}&to_date=${toDate.toISOString().split('T')[0]}`;
        }
        
        // Fetch data with timeout to prevent hanging requests
        const timeoutDuration = 30000; // 30 seconds timeout
        
        const fetchPromise = fetch(apiUrl);
        const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Request timed out')), timeoutDuration)
        );
        
        Promise.race([fetchPromise, timeoutPromise])
            .then(response => {
                if (!response.ok) {
                    throw new Error(`HTTP error! Status: ${response.status}`);
                }
                return response.json();
            })
            .then(data => {
                // Always make sure to remove loading indicator
                const loadingEls = chartContainer.querySelectorAll('.chart-loading');
                loadingEls.forEach(el => el.remove());
                
                if (!data || data.length === 0) {
                    chartContainer.innerHTML += '<div class="chart-error">No data available for the selected period. Try selecting "ALL" from the time interval.</div>';
                    return;
                }
                
                try {
                    // Recreate charts for clean state
                    const { chart: newChart, volumeChart: newVolumeChart } = createCharts();
                    chart = newChart;
                    volumeChart = newVolumeChart;
                    
                    // Direct implementation for company data
                    if (type === 'company') {
                        const ohlcData = [];
                        const volumeData = [];
                        
                        // Process each data point with more robust validation
                        for (let i = 0; i < data.length; i++) {
                            const item = data[i];
                            
                            const timeValue = item.time; 
                            
                            if (!/^\d{4}-\d{2}-\d{2}$/.test(timeValue)) {
                                console.warn(`Loop ${i}: Invalid time string format received from API:`, timeValue);
                                continue;
                            }
                            
                            const openPrice = parseFloat(item.open);
                            const highPrice = parseFloat(item.high);
                            const lowPrice = parseFloat(item.low);
                            const closePrice = parseFloat(item.close);
                            
                            if (!Number.isFinite(openPrice) || !Number.isFinite(highPrice) || 
                                !Number.isFinite(lowPrice) || !Number.isFinite(closePrice)) {
                                console.warn(`Item ${i}: Invalid or non-finite price values`, { 
                                    time: timeValue, 
                                    open: item.open, 
                                    high: item.high, 
                                    low: item.low, 
                                    close: item.close 
                                });
                                continue; 
                            }
                            
                            const validOhlcData = {
                                time: timeValue, 
                                open: openPrice, 
                                high: highPrice, 
                                low: lowPrice,   
                                close: closePrice 
                            };
                            
                            ohlcData.push(validOhlcData);
                            
                            const volumeValue = parseFloat(item.volume || 0);
                            const validVolumeValue = isNaN(volumeValue) ? 0 : volumeValue;
                            
                            volumeData.push({
                                time: timeValue, 
                                value: validVolumeValue,
                                color: (closePrice >= openPrice) ? 'rgba(76, 220, 143, 0.5)' : 'rgba(255, 90, 101, 0.5)'
                            });
                        }
                        
                        if (ohlcData.length === 0) {
                            chartContainer.innerHTML += '<div class="chart-error">No valid data points available for this chart.</div>';
                            return;
                        }
                        
                        if (chartType === 'candlestick') {
                            mainSeries = chart.addCandlestickSeries({
                                upColor: '#4cdc8f',
                                downColor: '#ff5a65',
                                borderVisible: false,
                                wickUpColor: '#4cdc8f',
                                wickDownColor: '#ff5a65',
                            });
                            
                            try {
                                const dataForChart = JSON.parse(JSON.stringify(ohlcData));
                                mainSeries.setData(dataForChart); 

                                lastData = data;

                            } catch (err) {
                                console.error('Error setting candlestick data:', err);
                                chartContainer.innerHTML += `<div class="chart-error">Error rendering candlestick chart: ${err.message}. Check browser console for details.</div>`;
                                return;
                            }
                        } else {
                            const lineData = ohlcData.map(item => ({ time: item.time, value: item.close }));
                            const dataForChart = JSON.parse(JSON.stringify(lineData));
                            mainSeries.setData(dataForChart);

                            lastData = data;
                        }

                        if (volumeChart && volumeData.length > 0) {
                            volumeSeries = volumeChart.addHistogramSeries({
                                color: '#26a69a',
                                priceFormat: {
                                    type: 'volume',
                                },
                                priceScaleId: '',
                            });
                            try {
                                const volumeDataForChart = JSON.parse(JSON.stringify(volumeData));
                                volumeSeries.setData(volumeDataForChart);
                            } catch (err) {
                                console.error('Error setting volume data:', err);
                            }
                        }

                        if (data.length > 0) {
                           updateLegendValues(data[data.length - 1], type);
                        }
                        volumeChartContainer.style.display = 'block';
                        volumeChartContainer.classList.remove('d-none');
                        volumeDataContainer.style.display = 'flex';
                    } else {
                        let indexChartData; 
                        let mainSeriesType = 'line'; 

                        if (chartType === 'candlestick' && data.length > 0 && 'open' in data[0]) {
                            indexChartData = data.map(item => ({
                                time: item.time, 
                                open: parseFloat(item.open || 0),
                                high: parseFloat(item.high || 0),
                                low: parseFloat(item.low || 0),
                                close: parseFloat(item.close || item.value || 0)
                            })).filter(item =>
                                /^\d{4}-\d{2}-\d{2}$/.test(item.time) &&
                                Number.isFinite(item.open) &&
                                Number.isFinite(item.high) &&
                                Number.isFinite(item.low) &&
                                Number.isFinite(item.close)
                            );
                            mainSeriesType = 'candlestick';
                            mainSeries = chart.addCandlestickSeries({
                                upColor: '#4cdc8f',
                                downColor: '#ff5a65',
                                borderVisible: false,
                                wickUpColor: '#4cdc8f',
                                wickDownColor: '#ff5a65',
                            });
                        } else {
                            indexChartData = data.map(item => ({
                                time: item.time, 
                                value: parseFloat(item.value || item.close || 0)
                            })).filter(item =>
                                /^\d{4}-\d{2}-\d{2}$/.test(item.time) &&
                                Number.isFinite(item.value)
                            );
                            mainSeriesType = 'line';
                            mainSeries = chart.addAreaSeries({
                                lineColor: '#9d71e8',
                                topColor: 'rgba(157, 113, 232, 0.5)',
                                bottomColor: 'rgba(157, 113, 232, 0.05)',
                                lineWidth: 2,
                                crosshairMarkerVisible: true,
                                crosshairMarkerRadius: 4,
                            });
                            volumeChartContainer.style.display = 'none';
                            volumeDataContainer.style.display = 'none';
                        }

                        if (indexChartData.length === 0) {
                            chartContainer.innerHTML += '<div class="chart-error">No valid data points available for this index chart.</div>';
                            return;
                        }

                        try {
                            const dataForChart = JSON.parse(JSON.stringify(indexChartData));
                            mainSeries.setData(dataForChart);

                            lastData = data;

                        } catch (err) {
                            console.error(`Error setting index ${mainSeriesType} data:`, err);
                            chartContainer.innerHTML += `<div class="chart-error">Error rendering index chart: ${err.message}. Check browser console for details.</div>`;
                            return;
                        }
                        if (data.length > 0) {
                            updateLegendValues(data[data.length - 1], type);
                        }
                    }

                    chart.subscribeCrosshairMove(param => {
                        if (param.time && lastData.length > 0) {
                            const fullDataPoint = lastData.find(d => {
                                let dTime = d.time;
                                if (typeof d.time === 'object' && d.time !== null && d.time.year && d.time.month && d.time.day) {
                                    try {
                                        dTime = `${d.time.year}-${String(d.time.month).padStart(2,'0')}-${String(d.time.day).padStart(2,'0')}`;
                                    } catch { dTime = null; }
                                } else if (typeof d.time !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(d.time)) {
                                     try {
                                         dTime = new Date(d.time).toISOString().split('T')[0];
                                         if (!/^\d{4}-\d{2}-\d{2}$/.test(dTime)) dTime = null; 
                                     } catch { dTime = null; }
                                }
                                return dTime === param.time;
                            });

                            if (param.seriesPrices.has(mainSeries)) {
                                 const price = param.seriesPrices.get(mainSeries);
                                 const dataPoint = chartType === 'candlestick' || (type === 'index' && mainSeriesType === 'candlestick') ?
                                     price : { close: price }; 
                                 if (fullDataPoint) {
                                     dataPoint.volume = fullDataPoint.volume;
                                     if (dataPoint.open === undefined) dataPoint.open = fullDataPoint.open;
                                     if (dataPoint.high === undefined) dataPoint.high = fullDataPoint.high;
                                     if (dataPoint.low === undefined) dataPoint.low = fullDataPoint.low;
                                     if (dataPoint.close === undefined) dataPoint.close = fullDataPoint.close || fullDataPoint.value;
                                     if (dataPoint.value === undefined) dataPoint.value = fullDataPoint.value;
                                 }
                                 dataPoint.time = param.time; 
                                 updateLegendValues(dataPoint, type);
                            }

                        } else {
                            if (lastData.length > 0) {
                                const latestPoint = lastData[lastData.length - 1];
                                updateLegendValues(latestPoint, type); 
                            }
                        }
                    });

                    chart.timeScale().fitContent();

                } catch (err) { 
                    console.error('Error during chart setup/processing:', err);
                    chartContainer.innerHTML += `<div class="chart-error">Error setting up chart: ${err.message}</div>`;
                }
            })
            .catch(error => { 
                console.error('Error loading chart data (fetch/timeout):', error);
                const loadingEls = chartContainer.querySelectorAll('.chart-loading');
                loadingEls.forEach(el => el.remove());
                chartContainer.innerHTML += `<div class="chart-error">Error loading chart data: ${error.message}</div>`;
             });
    }

    function updateLegendValues(dataPoint, type) {
        if (!dataPoint) return;
        
        const timeStr = dataPoint.time; 
        
        if (type === 'company' || (type === 'index' && dataPoint.open !== undefined)) {
            const open = parseFloat(dataPoint.open);
            const high = parseFloat(dataPoint.high);
            const low = parseFloat(dataPoint.low);
            const close = parseFloat(dataPoint.close);

            openValue.textContent = Number.isFinite(open) ? open.toFixed(2) : '-';
            highValue.textContent = Number.isFinite(high) ? high.toFixed(2) : '-';
            lowValue.textContent = Number.isFinite(low) ? low.toFixed(2) : '-';
            closeValue.textContent = Number.isFinite(close) ? close.toFixed(2) : '-';
            
            if (type === 'company' && dataPoint.volume !== undefined) {
                const volume = parseFloat(dataPoint.volume);
                volumeValueDisplay.textContent = Number.isFinite(volume) ? formatVolume(volume) : '-';
            } else {
                volumeValueDisplay.textContent = '-';
            }
            
            if (Number.isFinite(open) && Number.isFinite(close) && open !== 0) { 
                const change = close - open;
                const changePercentValue = (change / open) * 100;
                
                changeValue.textContent = change.toFixed(2);
                changePercent.textContent = changePercentValue.toFixed(2) + '%';
                
                if (change > 0) {
                    changeValue.className = 'legend-price text-success';
                    changePercent.className = 'legend-price text-success';
                } else if (change < 0) {
                    changeValue.className = 'legend-price text-danger';
                    changePercent.className = 'legend-price text-danger';
                } else {
                    changeValue.className = 'legend-price';
                    changePercent.className = 'legend-price';
                }
            } else {
                changeValue.textContent = '-';
                changePercent.textContent = '-';
                changeValue.className = 'legend-price';
                changePercent.className = 'legend-price';
            }
        } else { 
            const value = parseFloat(dataPoint.value || dataPoint.close);
            closeValue.textContent = Number.isFinite(value) ? value.toFixed(2) : '-';
            
            openValue.textContent = '-';
            highValue.textContent = '-';
            lowValue.textContent = '-';
            volumeValueDisplay.textContent = '-'; 

            changeValue.textContent = '-'; 
            changePercent.textContent = '-';
            changeValue.className = 'legend-price';
            changePercent.className = 'legend-price';

            if (lastData.length > 1 && timeStr) {
                const currentIndex = lastData.findIndex(p => p.time === timeStr);
                
                if (currentIndex > 0) {
                    const prevPoint = lastData[currentIndex - 1];
                    const prevValue = parseFloat(prevPoint.value || prevPoint.close);
                    const currentValue = value;
                    
                    if (Number.isFinite(prevValue) && Number.isFinite(currentValue) && prevValue !== 0) {
                        const change = currentValue - prevValue;
                        const changePercentValue = (change / prevValue) * 100;
                        
                        changeValue.textContent = change.toFixed(2);
                        changePercent.textContent = changePercentValue.toFixed(2) + '%';
                        
                        if (change > 0) {
                            changeValue.className = 'legend-price text-success';
                            changePercent.className = 'legend-price text-success';
                        } else if (change < 0) {
                            changeValue.className = 'legend-price text-danger';
                            changePercent.className = 'legend-price text-danger';
                        } else {
                            changeValue.className = 'legend-price';
                            changePercent.className = 'legend-price';
                        }
                    }
                }
            }
        }
    }

    // Setup chart search functionality (TradingView-like)
    function setupChartSearch() {
        // Setup event listeners for keyboard interaction with the chart
        document.addEventListener('keydown', function(e) {
            // Skip if we're in an input or currently searching
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') {
                // Special case: If in search input and Escape is pressed, close search
                if (e.key === 'Escape' && e.target === chartSearchInput) {
                    e.preventDefault();
                    hideSearch();
                    return;
                }
                
                // Special case: If in search input and Enter is pressed with results showing
                if (e.key === 'Enter' && e.target === chartSearchInput && 
                    chartSearchResults.style.display === 'block') {
                    e.preventDefault();
                    
                    // Select first result if available
                    const items = chartSearchResults.querySelectorAll('.chart-search-results-item');
                    if (items.length > 0) {
                        // Force select the first item if nothing is selected
                        if (!chartSearchResults.querySelector('.chart-search-results-item.active')) {
                            items[0].classList.add('active');
                            activeSearchIndex = 0;
                        }
                        
                        // Get active item
                        const activeItem = chartSearchResults.querySelector('.chart-search-results-item.active');
                        if (activeItem) {
                            applySearchSelection(activeItem);
                        }
                    }
                    return;
                }
                
                // For all other cases when focus is in a form element, skip keyboard handling
                return;
            }
            
            // Check for immediate close keys first
            if (chartSearchContainer.style.display === 'block') {
                // Close search on Escape
                if (e.key === 'Escape') {
                    e.preventDefault();
                    hideSearch();
                    return;
                }
                
                // Handle arrow keys for result navigation
                const items = chartSearchResults.querySelectorAll('.chart-search-results-item');
                if (chartSearchResults.style.display === 'block' && items.length > 0) {
                    if (e.key === 'ArrowDown') {
                        e.preventDefault();
                        navigateSearchResults(1, items);
                        return;
                    } else if (e.key === 'ArrowUp') {
                        e.preventDefault();
                        navigateSearchResults(-1, items);
                        return;
                    } else if (e.key === 'Enter') {
                        e.preventDefault();
                        
                        // Ensure there's an active item (first one by default)
                        if (activeSearchIndex === -1 && items.length > 0) {
                            items[0].classList.add('active');
                            activeSearchIndex = 0;
                        }
                        
                        // Directly call our selection function with the currently highlighted item
                        if (activeSearchIndex >= 0 && activeSearchIndex < items.length) {
                            // Get the active item
                            const activeItem = items[activeSearchIndex];
                            applySearchSelection(activeItem);
                        }
                        return;
                    }
                }
                
                // If input is empty and backspace is pressed, hide the search
                if (e.key === 'Backspace' && chartSearchInput.value === '') {
                    e.preventDefault();
                    hideSearch();
                    return;
                }
            }
            
            // Show search when pressing a letter/number on the chart
            if (chartSearchContainer.style.display !== 'block' && 
                e.key.length === 1 && e.key.match(/[a-z0-9]/i)) {
                
                // Show search box
                showSearch();
                
                // Focus search input and simulate typing the first letter
                chartSearchInput.focus();
                
                // We'll let the normal input handling catch the keypress
            }
        });
        
        // Handle input changes
        chartSearchInput.addEventListener('input', function() {
            const query = this.value.trim();
            
            // If backspace makes the input empty, hide search
            if (query === '' && event && event.inputType === 'deleteContentBackward') {
                hideSearch();
                return;
            }
            
            searchCompanies(query);
        });
        
        // When the user manually clicks a search result
        chartSearchResults.addEventListener('click', function(e) {
            const resultItem = e.target.closest('.chart-search-results-item');
            if (resultItem) {
                applySearchSelection(resultItem);
            }
        });
        
        // Hide search when clicking elsewhere
        document.addEventListener('click', function(e) {
            if (chartSearchContainer.style.display === 'block' && 
                !chartSearchContainer.contains(e.target)) {
                hideSearch();
            }
        });
    }
    
    // Helper function to apply a search selection
    function applySearchSelection(resultItem) {
        if (!resultItem) return;
        
        // Get the data value and symbol attributes
        const value = resultItem.dataset.value;
        const symbol = resultItem.dataset.symbol;
        
        if (value) {
            console.log("Applying selection:", symbol);
            
            // Update the chart title directly 
            chartTitle.textContent = symbol;
            
            // Parse the selection value
            const [typeData, idData] = value.split(',');
            const type = typeData.split(':')[1];
            const id = idData.split(':')[1];
            
            // Update the current symbol type and ID
            currentSymbolType = type;
            currentSymbolId = id;
            
            // Configure volume display based on type
            if (type === 'company') {
                volumeDataContainer.style.display = 'flex';
                volumeChartContainer.style.display = 'block';
                
                if (chartType !== 'candlestick') {
                    chartType = 'candlestick';
                    candleChartBtn.classList.add('active');
                    lineChartBtn.classList.remove('active');
                }
            } else {
                volumeDataContainer.style.display = 'none';
                volumeChartContainer.style.display = 'none';
            }
            
            // Load the chart data directly
            loadChartData(type, id);
            
            // Hide the search UI
            hideSearch();
        }
    }
    
    // Helper function to show search UI
    function showSearch() {
        chartSearchContainer.style.display = 'block';
        searchHint.classList.add('visible');
        
        // Clear input and results
        chartSearchInput.value = '';
        chartSearchResults.innerHTML = '';
        chartSearchResults.style.display = 'none';
        
        // Reset active result index
        activeSearchIndex = -1;
    }
    
    // Helper function to hide search UI
    function hideSearch() {
        chartSearchContainer.style.display = 'none';
        chartSearchResults.style.display = 'none';
        searchHint.classList.remove('visible');
        chartSearchInput.value = '';
        chartSearchResults.innerHTML = '';
        
        // Reset active result index
        activeSearchIndex = -1;
    }
    
    // Search companies based on input
    function searchCompanies(query) {
        // Clear previous results
        chartSearchResults.innerHTML = '';
        
        // Empty query = hide results
        query = (query || '').toLowerCase().trim();
        if (!query) {
            chartSearchResults.style.display = 'none';
            return;
        }
        
        // Filter and sort companies based on query
        const matchResults = [];
        
        allCompanies.forEach(company => {
            const symbol = company.symbol.toLowerCase();
            const name = company.name ? company.name.toLowerCase() : '';
            let priority = 999; // Default to lowest priority
            
            // Calculate match quality (lower number = higher priority)
            if (symbol === query) {
                // Exact symbol match - highest priority
                priority = 1;
            } else if (symbol.startsWith(query)) {
                // Symbol starts with query - high priority
                priority = 2;
            } else if (name && name.startsWith(query)) {
                // Company name starts with query - high priority for name match
                priority = 3;
            } else {
                // Check for word matches in company name
                if (name) {
                    const words = name.split(/\s+/);
                    for (const word of words) {
                        if (word.startsWith(query)) {
                            // Word in company name starts with query - medium priority
                            priority = 4;
                            break;
                        }
                    }
                }
                
                // If no word match found, check for contains matches
                if (priority === 999) {
                    if (symbol.includes(query)) {
                        // Symbol contains query - lower priority
                        priority = 5;
                    } else if (name && name.includes(query)) {
                        // Company name contains query - lowest match priority
                        priority = 6;
                    }
                }
            }
            
            // If we found a match, add it to results
            if (priority < 999) {
                matchResults.push({ company, priority });
            }
        });
        
        // Sort by priority (lower number = higher priority) and then alphabetically
        matchResults.sort((a, b) => {
            if (a.priority !== b.priority) {
                return a.priority - b.priority;
            }
            return a.company.symbol.localeCompare(b.company.symbol);
        });
        
        if (matchResults.length === 0) {
            chartSearchResults.style.display = 'none';
            return;
        }
        
        // Create result items
        matchResults.forEach((result, index) => {
            const company = result.company;
            const resultItem = document.createElement('div');
            resultItem.className = 'chart-search-results-item';
            resultItem.dataset.value = company.value;
            resultItem.dataset.symbol = company.symbol;
            resultItem.dataset.index = index;
            
            const symbolSpan = document.createElement('div');
            symbolSpan.className = 'chart-search-results-item-symbol';
            symbolSpan.textContent = company.symbol;
            
            resultItem.appendChild(symbolSpan);
            
            // Add company name if available
            if (company.name) {
                const nameSpan = document.createElement('div');
                nameSpan.className = 'chart-search-results-item-name';
                nameSpan.textContent = company.name;
                resultItem.appendChild(nameSpan);
            }
            
            chartSearchResults.appendChild(resultItem);
        });
        
        // Show results
        chartSearchResults.style.display = 'block';
        
        // Auto-select the first result
        if (matchResults.length > 0) {
            const firstItem = chartSearchResults.querySelector('.chart-search-results-item');
            if (firstItem) {
                firstItem.classList.add('active');
                activeSearchIndex = 0;
            }
        }
    }
    
    // Navigate through search results with keyboard
    function navigateSearchResults(direction, items) {
        if (items.length === 0) return;
        
        // Clear existing active class
        items.forEach(item => item.classList.remove('active'));
        
        // Calculate new index
        if (direction > 0) {
            activeSearchIndex = (activeSearchIndex + 1) % items.length;
        } else {
            activeSearchIndex = (activeSearchIndex - 1 + items.length) % items.length;
        }
        
        // Set new active item
        const activeItem = items[activeSearchIndex];
        activeItem.classList.add('active');
        
        // Scroll to ensure the active item is visible
        if (activeItem.offsetTop < chartSearchResults.scrollTop) {
            chartSearchResults.scrollTop = activeItem.offsetTop;
        } else if (activeItem.offsetTop + activeItem.offsetHeight > chartSearchResults.scrollTop + chartSearchResults.clientHeight) {
            chartSearchResults.scrollTop = activeItem.offsetTop + activeItem.offsetHeight - chartSearchResults.clientHeight;
        }
    }
    
    // Fetch company data for search functionality
    function fetchCompanyData() {
        fetch('/charts/api/companies')
            .then(response => {
                if (!response.ok) {
                    throw new Error(`HTTP error! Status: ${response.status}`);
                }
                return response.json();
            })
            .then(data => {
                allCompanies = data.map(company => ({
                    id: company.id,
                    symbol: company.symbol,
                    name: company.name || '',
                    value: `type:${company.isIndex ? 'index' : 'company'},id:${company.id}`
                }));
            })
            .catch(error => {
                console.error('Error fetching company data:', error);
            });
    }

    // Setup indicators menu functionality
    function setupIndicatorsMenu() {
        const indicatorsMenuBtn = document.getElementById('indicatorsMenuBtn');
        const indicatorsMenu = document.getElementById('indicatorsMenu');
        
        // Toggle indicators menu on button click
        indicatorsMenuBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            indicatorsMenu.classList.toggle('show');
        });
        
        // Close menu when clicking outside
        document.addEventListener('click', function() {
            indicatorsMenu.classList.remove('show');
        });
        
        // Prevent menu from closing when clicking inside it
        indicatorsMenu.addEventListener('click', function(e) {
            e.stopPropagation();
        });
        
        // Handle indicator selection
        const indicatorItems = indicatorsMenu.querySelectorAll('.indicator-item');
        indicatorItems.forEach(item => {
            item.addEventListener('click', function() {
                const indicatorType = this.getAttribute('data-indicator');
                showIndicatorDialog(indicatorType);
            });
        });
    }
    
    // Show indicator configuration dialog
    function showIndicatorDialog(indicatorType) {
        // Remove any existing dialog first
        const existingDialog = document.getElementById('indicatorDialog');
        if (existingDialog) {
            existingDialog.remove();
        }
        
        // Create dialog element
        const dialog = document.createElement('div');
        dialog.id = 'indicatorDialog';
        dialog.className = 'indicator-dialog';
        
        let dialogContent = '';
        let defaultParams = {};
        
        // Customize dialog based on indicator type
        switch (indicatorType) {
            case 'sma':
                defaultParams = { length: 20, source: 'close' };
                dialogContent = `
                    <div class="dialog-header">
                        <h4>Simple Moving Average (SMA)</h4>
                        <button class="dialog-close">&times;</button>
                    </div>
                    <div class="dialog-content">
                        <div class="form-group">
                            <label for="sma-length">Period Length</label>
                            <input type="number" id="sma-length" value="20" min="1" max="200">
                        </div>
                        <div class="form-group">
                            <label for="sma-source">Price Source</label>
                            <select id="sma-source">
                                <option value="close" selected>Close</option>
                                <option value="open">Open</option>
                                <option value="high">High</option>
                                <option value="low">Low</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label for="sma-color">Line Color</label>
                            <input type="color" id="sma-color" value="#2962FF">
                        </div>
                    </div>
                    <div class="dialog-footer">
                        <button class="btn-cancel">Cancel</button>
                        <button class="btn-apply" id="applyIndicatorBtn">Apply</button>
                    </div>
                `;
                break;
            // Additional indicator cases can be added here
            default:
                dialogContent = `
                    <div class="dialog-header">
                        <h4>Indicator Settings</h4>
                        <button class="dialog-close">&times;</button>
                    </div>
                    <div class="dialog-content">
                        <p>No settings available for this indicator.</p>
                    </div>
                    <div class="dialog-footer">
                        <button class="btn-cancel">Cancel</button>
                        <button class="btn-apply" id="applyIndicatorBtn">Apply</button>
                    </div>
                `;
        }
        
        dialog.innerHTML = dialogContent;
        document.body.appendChild(dialog);
        
        // Center dialog
        dialog.style.top = `${window.innerHeight / 2 - dialog.offsetHeight / 2}px`;
        dialog.style.left = `${window.innerWidth / 2 - dialog.offsetWidth / 2}px`;
        
        // Handle dialog close button
        const closeBtn = dialog.querySelector('.dialog-close');
        closeBtn.addEventListener('click', function() {
            dialog.remove();
        });
        
        // Handle Cancel button
        const cancelBtn = dialog.querySelector('.btn-cancel');
        cancelBtn.addEventListener('click', function() {
            dialog.remove();
        });
        
        // Handle Apply button - Direct event listener
        const applyBtn = dialog.querySelector('.btn-apply');
        if (applyBtn) {
            applyBtn.addEventListener('click', function() {
                console.log("Apply button clicked for indicator:", indicatorType);
                const params = {};
                const options = {};
                
                // Get parameters based on indicator type
                switch (indicatorType) {
                    case 'sma':
                        params.length = parseInt(document.getElementById('sma-length').value) || 20;
                        params.source = document.getElementById('sma-source').value || 'close';
                        options.color = document.getElementById('sma-color').value || '#2962FF';
                        console.log("SMA Parameters:", params, options);
                        break;
                    // Add more cases for other indicators
                }
                
                // Create or update the indicator
                createIndicator(indicatorType, params, options);
                
                // Close dialog
                dialog.remove();
            });
        } else {
            console.error("Apply button not found in the dialog!");
        }
        
        // Make dialog draggable
        makeDraggable(dialog);
    }
    
    // Create or update an indicator
    function createIndicator(type, params = {}, options = {}) {
        console.log(`Creating indicator: ${type} with params:`, params, options);
        
        if (!chart || !mainSeries) {
            console.error('Cannot create indicator: chart or main series not initialized');
            return;
        }
        
        // Generate a unique ID for this indicator instance
        const id = `${type}-${Date.now()}`;
        
        // Create the indicator based on type
        let indicator = null;
        
        switch (type) {
            case 'sma':
                // Create SMA indicator
                indicator = new SMAIndicator(id, chart, mainSeries, options);
                indicator.setParams(params);
                
                // Get the chart data
                const lastDataCopy = JSON.parse(JSON.stringify(lastData));
                
                // Calculate SMA data directly
                const smaLength = params.length || 20;
                const source = params.source || 'close';
                const smaData = [];
                
                // Calculate SMA values
                for (let i = 0; i < lastDataCopy.length; i++) {
                    if (i < smaLength - 1) {
                        // Not enough data points yet, add a placeholder
                        smaData.push({ 
                            time: lastDataCopy[i].time,
                            value: null
                        });
                    } else {
                        // Calculate the SMA
                        let sum = 0;
                        for (let j = 0; j < smaLength; j++) {
                            const price = lastDataCopy[i - j][source];
                            if (typeof price === 'number') {
                                sum += price;
                            }
                        }
                        
                        smaData.push({
                            time: lastDataCopy[i].time,
                            value: sum / smaLength
                        });
                    }
                }
                
                // Create a line series for the SMA
                const smaSeries = chart.addLineSeries({
                    color: options.color || '#2962FF',
                    lineWidth: options.lineWidth || 2,
                    title: `SMA (${smaLength})`,
                    priceScaleId: options.priceScaleId || 'right'
                });
                
                // Set the data
                smaSeries.setData(smaData);
                
                // Store the series in the indicator
                indicator.series = smaSeries;
                break;
                
            // Add more indicator cases here
            default:
                console.error(`Unknown indicator type: ${type}`);
                return;
        }
        
        // Store the indicator in activeIndicators
        activeIndicators[id] = indicator;
        
        // Create indicator control UI
        createIndicatorControl(indicator);
        
        return indicator;
    }
    
    // Create indicator control UI element
    function createIndicatorControl(indicator) {
        if (!indicator) return;
        
        // Check if container exists, create if not
        if (!indicatorsContainer) {
            console.error('Indicators container not found');
            return;
        }
        
        // Create indicator control element
        const controlEl = document.createElement('div');
        controlEl.className = 'indicator-control';
        controlEl.setAttribute('data-id', indicator.id);
        
        const colorSquare = document.createElement('span');
        colorSquare.className = 'indicator-color';
        colorSquare.style.backgroundColor = indicator.options.color;
        
        const nameEl = document.createElement('span');
        nameEl.className = 'indicator-name';
        nameEl.textContent = indicator.getName();
        
        const removeBtn = document.createElement('button');
        removeBtn.className = 'indicator-remove';
        removeBtn.innerHTML = '&times;';
        removeBtn.title = 'Remove this indicator';
        
        controlEl.appendChild(colorSquare);
        controlEl.appendChild(nameEl);
        controlEl.appendChild(removeBtn);
        
        // Add to container
        indicatorsContainer.appendChild(controlEl);
        
        // Make indicators container visible if it was hidden
        indicatorsContainer.style.display = 'flex';
        
        // Handle remove button click
        removeBtn.addEventListener('click', function() {
            // Remove the indicator
            if (indicator.id in activeIndicators) {
                indicator.remove();
                delete activeIndicators[indicator.id];
            }
            
            // Remove the control element
            controlEl.remove();
            
            // Hide container if no indicators left
            if (Object.keys(activeIndicators).length === 0) {
                indicatorsContainer.style.display = 'none';
            }
        });
    }
    
    // Edit existing indicator
    function editIndicator(indicator) {
        // Show the indicator dialog with current settings
        showIndicatorDialog(indicator.getType());
        
        // Set the existing values in the dialog
        setTimeout(() => {
            const dialog = document.getElementById('indicatorDialog');
            if (!dialog) return;
            
            switch (indicator.getType()) {
                case 'sma':
                    const lengthInput = document.getElementById('sma-length');
                    const sourceSelect = document.getElementById('sma-source');
                    const colorInput = document.getElementById('sma-color');
                    
                    if (lengthInput) lengthInput.value = indicator.params.length;
                    if (sourceSelect) sourceSelect.value = indicator.params.source;
                    if (colorInput) colorInput.value = indicator.options.color;
                    break;
                // Add more cases for other indicators
            }
            
            // Override Apply button action
            const applyBtn = dialog.querySelector('.btn-apply');
            if (applyBtn) {
                // Remove existing event listeners
                const newApplyBtn = applyBtn.cloneNode(true);
                applyBtn.parentNode.replaceChild(newApplyBtn, applyBtn);
                
                // Add new event listener for editing
                newApplyBtn.addEventListener('click', function() {
                    const params = {};
                    const options = {};
                    
                    // Get parameters based on indicator type
                    switch (indicator.getType()) {
                        case 'sma':
                            params.length = parseInt(document.getElementById('sma-length').value) || 20;
                            params.source = document.getElementById('sma-source').value || 'close';
                            options.color = document.getElementById('sma-color').value || '#2962FF';
                            break;
                        // Add more cases for other indicators
                    }
                    
                    // Update indicator parameters and options
                    indicator.options = { ...indicator.options, ...options };
                    indicator.setParams(params);
                    
                    // Update indicator series options
                    if (indicator.series) {
                        indicator.series.applyOptions({
                            color: options.color,
                            title: indicator.getName()
                        });
                    }
                    
                    // Update the control label
                    const controlElement = document.querySelector(`.indicator-control[data-id="${indicator.id}"]`);
                    if (controlElement) {
                        const labelElement = controlElement.querySelector('.indicator-label');
                        if (labelElement) {
                            labelElement.textContent = indicator.getName();
                        }
                    }
                    
                    // Close dialog
                    dialog.remove();
                });
            }
        }, 100);
    }
    
    // Remove indicator
    function removeIndicator(id) {
        const indicator = activeIndicators[id];
        if (indicator) {
            indicator.remove();
            delete activeIndicators[id];
        }
    }
    
    // Make an element draggable
    function makeDraggable(element) {
        let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
        
        const header = element.querySelector('.dialog-header');
        if (header) {
            header.onmousedown = dragMouseDown;
        } else {
            element.onmousedown = dragMouseDown;
        }
        
        function dragMouseDown(e) {
            e = e || window.event;
            e.preventDefault();
            
            // Get mouse position at startup
            pos3 = e.clientX;
            pos4 = e.clientY;
            
            document.onmouseup = closeDragElement;
            document.onmousemove = elementDrag;
        }
        
        function elementDrag(e) {
            e = e || window.event;
            e.preventDefault();
            
            // Calculate new position
            pos1 = pos3 - e.clientX;
            pos2 = pos4 - e.clientY;
            pos3 = e.clientX;
            pos4 = e.clientY;
            
            // Set new position
            element.style.top = (element.offsetTop - pos2) + "px";
            element.style.left = (element.offsetLeft - pos1) + "px";
        }
        
        function closeDragElement() {
            // Stop moving when mouse button is released
            document.onmouseup = null;
            document.onmousemove = null;
        }
    }
    
    // Function to update all indicators when chart data changes
    function updateIndicators() {
        Object.values(activeIndicators).forEach(indicator => {
            indicator.update();
        });
    }

    // Add CSS for indicator UI
    function addIndicatorStyles() {
        const styleElement = document.createElement('style');
        styleElement.textContent = `
            .indicators-container {
                position: absolute;
                top: 10px;
                right: 10px;
                z-index: 2;
                display: flex;
                flex-direction: column;
                gap: 5px;
            }
            
            .indicator-control {
                background: rgba(30, 30, 44, 0.7);
                border-radius: 4px;
                padding: 5px 10px;
                display: flex;
                justify-content: space-between;
                align-items: center;
                color: #a2a0b3;
                font-size: 12px;
            }
            
            .indicator-actions {
                display: flex;
                gap: 5px;
            }
            
            .indicator-edit, .indicator-remove {
                background: none;
                border: none;
                color: #a2a0b3;
                cursor: pointer;
                font-size: 14px;
                padding: 0 5px;
            }
            
            .indicator-edit:hover, .indicator-remove:hover {
                color: white;
            }
            
            .indicators-menu {
                display: none;
                position: absolute;
                background: rgba(30, 30, 44, 0.9);
                border-radius: 4px;
                box-shadow: 0 2px 5px rgba(0, 0, 0, 0.2);
                padding: 5px 0;
                min-width: 120px;
                z-index: 1000;
            }
            
            .indicators-menu.show {
                display: block;
            }
            
            .indicator-item {
                padding: 8px 15px;
                cursor: pointer;
                color: #a2a0b3;
            }
            
            .indicator-item:hover {
                background: rgba(157, 113, 232, 0.15);
                color: #9d71e8;
            }
            
            .indicator-dialog {
                position: fixed;
                z-index: 1001;
                background: rgba(30, 30, 44, 0.95);
                border-radius: 6px;
                box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
                width: 300px;
                overflow: hidden;
            }
            
            .dialog-header {
                background: rgba(40, 40, 54, 0.8);
                padding: 10px 15px;
                display: flex;
                justify-content: space-between;
                align-items: center;
                cursor: move;
            }
            
            .dialog-header h4 {
                margin: 0;
                font-size: 16px;
                color: #e0e0e6;
            }
            
            .dialog-close {
                background: none;
                border: none;
                color: #a2a0b3;
                font-size: 20px;
                cursor: pointer;
            }
            
            .dialog-content {
                padding: 15px;
            }
            
            .form-group {
                margin-bottom: 15px;
            }
            
            .form-group label {
                display: block;
                margin-bottom: 5px;
                color: #a2a0b3;
            }
            
            .form-group input, .form-group select {
                width: 100%;
                padding: 8px 10px;
                background: rgba(20, 20, 34, 0.8);
                border: 1px solid rgba(60, 60, 80, 0.5);
                border-radius: 4px;
                color: #e0e0e6;
            }
            
            .dialog-footer {
                padding: 10px 15px;
                display: flex;
                justify-content: flex-end;
                gap: 10px;
                background: rgba(40, 40, 54, 0.5);
            }
            
            .btn-cancel, .btn-apply {
                padding: 8px 15px;
                border-radius: 4px;
                cursor: pointer;
                border: none;
            }
            
            .btn-cancel {
                background: rgba(60, 60, 80, 0.5);
                color: #a2a0b3;
            }
            
            .btn-apply {
                background: #9d71e8;
                color: white;
            }
        `;
        
        document.head.appendChild(styleElement);
    }

    // Add the styles to the document
    addIndicatorStyles();
});