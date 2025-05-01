document.addEventListener('DOMContentLoaded', function() {
    const chartContainer = document.getElementById('container');
    const { createChart, AreaSeries, CandlestickSeries } = LightweightCharts;
    let chart;
    let initialLayoutSet = false;

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
                    enableResize: false
                }
            },
            grid: {
                vertLines: { visible: false },
                horzLines: { visible: false }
            }
        };

        chart = createChart(chartContainer, chartOptions);

        // Handle window resizing - only update dimensions, not pane order
        function handleResize() {
            chart.applyOptions({
                width: chartContainer.clientWidth,
                height: chartContainer.clientHeight
            });
            
            // Only update heights, not positions
            const panes = chart.panes();
            if (panes && panes.length > 1) {
                const totalHeight = chartContainer.clientHeight;
                const mainPane = panes[0];
                if (mainPane) {
                    mainPane.setHeight(Math.floor(totalHeight * 0.8));
                }
            }
        }

        window.addEventListener('resize', handleResize);

        // Create candlestick series first in pane 0 (main pane)
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

        // Create area series in pane 1
        const areaSeries = chart.addSeries(AreaSeries, {
            topColor: '#2962FF',
            bottomColor: 'rgba(41, 98, 255, 0.28)',
            lineColor: '#2962FF',
            lineWidth: 2
        }, 1);  // Bottom pane

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

                    const areaData = data.map(item => ({
                        time: item.time,
                        value: parseFloat(item.close || item.value)
                    }));

                    // Set data for both series
                    candlestickSeries.setData(chartData);
                    areaSeries.setData(areaData);

                    // Set initial layout only once
                    if (!initialLayoutSet) {
                        const panes = chart.panes();
                        if (panes && panes.length > 1) {
                            const mainPane = panes[0];
                            if (mainPane) {
                                mainPane.setHeight(Math.floor(chartContainer.clientHeight * 0.8));
                            }
                            initialLayoutSet = true;
                        }
                    }

                    chart.timeScale().fitContent();
                }
            })
            .catch(error => {
                console.error('Error loading chart data:', error);
            });

        return chart;
    }

    if (chartContainer) {
        initChart();
    }
});