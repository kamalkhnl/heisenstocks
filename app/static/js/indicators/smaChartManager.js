class SMAChartManager {
    constructor(chart, mainPane) {
        this.chart = chart;
        this.mainPane = mainPane;
        this.smaLines = new Map(); // Store multiple SMA lines
    }

    addSMA(period, color) {
        const { LineSeries } = LightweightCharts;
        const smaLine = this.chart.addSeries(LineSeries, {
            color: color,
            lineWidth: 2,
            title: `SMA ${period}`
        }, this.mainPane);

        this.smaLines.set(period, smaLine);
        return smaLine;
    }

    updateData(chartData) {
        this.smaLines.forEach((line, period) => {
            const smaIndicator = new SMAIndicator(period);
            const smaData = smaIndicator.calculate(chartData);
            line.setData(smaData);
        });
    }

    removeSMA(period) {
        const line = this.smaLines.get(period);
        if (line) {
            this.chart.removeSeries(line);
            this.smaLines.delete(period);
        }
    }

    removeAll() {
        this.smaLines.forEach((line) => {
            this.chart.removeSeries(line);
        });
        this.smaLines.clear();
    }
}