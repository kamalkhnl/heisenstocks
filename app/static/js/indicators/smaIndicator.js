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