document.addEventListener('DOMContentLoaded', function() {
    const chartContainer = document.getElementById('container');
    const { createChart, AreaSeries, CandlestickSeries, HistogramSeries } = LightweightCharts;
    let chart;
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

    function initChart() {
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

        chart = createChart(chartContainer, chartOptions);
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
        const candlestickSeries = chart.addSeries(
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

        // Create histogram series for squeeze momentum
        const squeezeHistogram = chart.addSeries(HistogramSeries, {
            color: '#26a69a',
            base: 0,
            lineWidth: 4,
        }, 1);  // Bottom pane

        // Create dot series for squeeze state
        const squeezeDots = chart.addSeries(HistogramSeries, {
            color: 'blue',
            base: 0,
            lineWidth: 2,
        }, 1);

        // Fetch and set data
        const params = new URLSearchParams(window.location.search);
        const type = params.get('type') || 'index';
        const id = params.get('id') || 'NEPSE Index';

        fetch(`/charts/api/data?type=${type}&id=${id}`)
            .then(response => response.json())
            .then(data => {
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

                    // Force layout update after data is loaded
                    setTimeout(applyPaneLayout, 100);

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
                                // Force layout update after time range is set
                                applyPaneLayout();
                            }, 50);
                        }
                    }
                }
            })
            .catch(error => {
                console.error('Error loading chart data:', error);
            });

        return chart;
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

    if (chartContainer) {
        initChart();
    }
});