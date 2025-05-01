class SMAIndicator {
    constructor(period = 20) {
        this.period = period;
    }

    calculate(data) {
        const source = data.map(d => parseFloat(d.close || d.value));
        const smaValues = this.sma(source, this.period);

        return data.map((d, i) => ({
            time: d.time,
            value: smaValues[i]
        }));
    }

    sma(data, period) {
        const result = [];
        for (let i = 0; i < data.length; i++) {
            if (i < period - 1) {
                result.push(null);
                continue;
            }
            const sum = data.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0);
            result.push(sum / period);
        }
        return result;
    }
}

class SMAManager {
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

        this.smaLines.set(period, { line: smaLine, color });
        return smaLine;
    }

    updateSMAColor(period, color) {
        const sma = this.smaLines.get(period);
        if (sma) {
            sma.color = color;
            sma.line.applyOptions({ color });
        }
    }

    updateData(chartData) {
        this.smaLines.forEach((sma, period) => {
            const smaIndicator = new SMAIndicator(period);
            const smaData = smaIndicator.calculate(chartData);
            sma.line.setData(smaData);
        });
    }

    removeSMA(period) {
        const sma = this.smaLines.get(period);
        if (sma) {
            this.chart.removeSeries(sma.line);
            this.smaLines.delete(period);
        }
    }

    removeAll() {
        this.smaLines.forEach((sma) => {
            this.chart.removeSeries(sma.line);
        });
        this.smaLines.clear();
    }
}