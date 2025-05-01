class SqueezeIndicator {
    constructor() {
        this.length = 20;        // BB Length
        this.mult = 2.0;         // BB MultFactor
        this.lengthKC = 20;      // KC Length
        this.multKC = 1.5;       // KC MultFactor
    }

    calculate(data) {
        const source = data.map(d => parseFloat(d.close || d.value));
        const high = data.map(d => parseFloat(d.high));
        const low = data.map(d => parseFloat(d.low));
        
        // Calculate Bollinger Bands
        const basis = this.sma(source, this.length);
        const dev = this.mult * this.standardDeviation(source, this.length);
        const upperBB = basis.map((b, i) => b + dev[i]);
        const lowerBB = basis.map((b, i) => b - dev[i]);

        // Calculate Keltner Channels
        const ma = this.sma(source, this.lengthKC);
        const trueRange = this.getTrueRange(high, low, source);
        const rangema = this.sma(trueRange, this.lengthKC);
        const upperKC = ma.map((m, i) => m + (rangema[i] * this.multKC));
        const lowerKC = ma.map((m, i) => m - (rangema[i] * this.multKC));

        // Calculate Squeeze
        const sqzOn = lowerBB.map((lb, i) => lb > lowerKC[i] && upperBB[i] < upperKC[i]);
        const sqzOff = lowerBB.map((lb, i) => lb < lowerKC[i] && upperBB[i] > upperKC[i]);
        
        // Calculate momentum value
        const highest = this.rolling(high, this.lengthKC, Math.max);
        const lowest = this.rolling(low, this.lengthKC, Math.min);
        const avg1 = highest.map((h, i) => (h + lowest[i]) / 2);
        const avg2 = avg1.map((a, i) => (a + ma[i]) / 2);
        
        const val = this.linearRegression(source.map((s, i) => s - avg2[i]), this.lengthKC);

        return data.map((_, i) => ({
            time: data[i].time,
            value: val[i],
            sqzOn: sqzOn[i],
            sqzOff: sqzOff[i],
            noSqz: !sqzOn[i] && !sqzOff[i],
            momentum: val[i] > 0 ? 
                (val[i] > (val[i-1] || 0) ? 'strong_up' : 'weak_up') :
                (val[i] < (val[i-1] || 0) ? 'strong_down' : 'weak_down')
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

    standardDeviation(data, period) {
        const smas = this.sma(data, period);
        const result = [];
        
        for (let i = 0; i < data.length; i++) {
            if (i < period - 1) {
                result.push(null);
                continue;
            }
            const slice = data.slice(i - period + 1, i + 1);
            const mean = smas[i];
            const sum = slice.reduce((a, b) => a + Math.pow(b - mean, 2), 0);
            result.push(Math.sqrt(sum / period));
        }
        return result;
    }

    getTrueRange(high, low, close) {
        const tr = [];
        for (let i = 0; i < high.length; i++) {
            if (i === 0) {
                tr.push(high[i] - low[i]);
                continue;
            }
            const prevClose = close[i - 1];
            tr.push(Math.max(
                high[i] - low[i],
                Math.abs(high[i] - prevClose),
                Math.abs(low[i] - prevClose)
            ));
        }
        return tr;
    }

    rolling(data, period, fn) {
        const result = [];
        for (let i = 0; i < data.length; i++) {
            if (i < period - 1) {
                result.push(null);
                continue;
            }
            result.push(fn(...data.slice(i - period + 1, i + 1)));
        }
        return result;
    }

    linearRegression(data, period) {
        const result = [];
        for (let i = 0; i < data.length; i++) {
            if (i < period - 1) {
                result.push(null);
                continue;
            }
            
            const slice = data.slice(i - period + 1, i + 1);
            const x = Array.from({length: period}, (_, i) => i);
            const y = slice;
            
            const n = period;
            const sumX = x.reduce((a, b) => a + b, 0);
            const sumY = y.reduce((a, b) => a + b, 0);
            const sumXY = x.reduce((a, b, i) => a + b * y[i], 0);
            const sumXX = x.reduce((a, b) => a + b * b, 0);
            
            const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
            const intercept = (sumY - slope * sumX) / n;
            
            result.push(slope * (period - 1) + intercept);
        }
        return result;
    }
}