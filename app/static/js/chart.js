document.addEventListener('DOMContentLoaded', function() {
    const chartContainer = document.getElementById('container');
    const { createChart, AreaSeries, CandlestickSeries } = LightweightCharts;

    function initChart() {
        const chart = createChart(chartContainer, {
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
        });

        const areaSeries = chart.addSeries(AreaSeries, {
            topColor: '#2962FF',
            bottomColor: 'rgba(41, 98, 255, 0.28)',
            lineColor: '#2962FF',
            lineWidth: 2
        });

        const candlestickSeries = chart.addSeries(
            CandlestickSeries,
            {
                upColor: '#26a69a',
                downColor: '#ef5350',
                borderVisible: false,
                wickUpColor: '#26a69a',
                wickDownColor: '#ef5350'
            },
            1
        );

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

                    areaSeries.setData(areaData);
                    candlestickSeries.setData(chartData);

                    // Set up pane heights and order
                    const candlesPane = chart.panes()[1];
                    candlesPane.moveTo(0);
                    candlesPane.setHeight(500);

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