class SSLHybridIndicator {
    constructor() {
        // Default settings from Pine script
        this.baselineLength = 20; // Reduced from 60 to be more responsive
        this.ssl2Length = 5;
        this.exitLength = 15;
        this.atrLength = 14;
        this.atrMultiplier = 1;
        this.baseChannelMultiplier = 0.2;
        this.continuationAtrCriteria = 0.9;
        this.showBaseline = true;
        this.showSSL1 = false;
        this.showATR = true;
        this.bullColor = '#388e3c'; // Cyan for bullish trend
        this.bearColor = '#b22833'; // Magenta for bearish trend
    }

    // Simple Moving Average implementation
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

    // Exponential Moving Average implementation
    ema(data, period) {
        const result = [];
        const alpha = 2 / (period + 1);
        
        for (let i = 0; i < data.length; i++) {
            if (i === 0) {
                result.push(data[0]);
            } else {
                result.push(alpha * data[i] + (1 - alpha) * result[i - 1]);
            }
        }
        return result;
    }

    // Weighted Moving Average implementation
    wma(data, period) {
        const result = [];
        for (let i = 0; i < data.length; i++) {
            if (i < period - 1) {
                result.push(null);
                continue;
            }
            
            let sum = 0;
            let weightSum = 0;
            for (let j = 0; j < period; j++) {
                const weight = period - j;
                sum += data[i - j] * weight;
                weightSum += weight;
            }
            result.push(sum / weightSum);
        }
        return result;
    }

    // Hull Moving Average implementation
    hma(data, period) {
        const halfPeriod = Math.floor(period / 2);
        const sqrtPeriod = Math.floor(Math.sqrt(period));
        
        const wma1 = this.wma(data, halfPeriod);
        const wma2 = this.wma(data, period);
        
        // Calculate 2 * WMA(halfPeriod) - WMA(period)
        const diff = [];
        for (let i = 0; i < data.length; i++) {
            if (wma1[i] === null || wma2[i] === null) {
                diff.push(null);
            } else {
                diff.push(2 * wma1[i] - wma2[i]);
            }
        }
        
        // Final HMA is WMA of diff with sqrtPeriod
        // Don't filter null values - this maintains proper data alignment
        return this.wma(diff, sqrtPeriod);
    }

    // Moving Average function selector (simplified to most common types)
    ma(type, data, period) {
        switch(type) {
            case 'SMA': return this.sma(data, period);
            case 'EMA': return this.ema(data, period);
            case 'WMA': return this.wma(data, period);
            case 'HMA': return this.hma(data, period);
            default: return this.sma(data, period);
        }
    }

    calculate(data) {
        // Extract data series
        const high = data.map(d => parseFloat(d.high));
        const low = data.map(d => parseFloat(d.low));
        const close = data.map(d => parseFloat(d.close));
        
        // Calculate SSL Baseline components (originally SSL1 from Pine script)
        const emaHigh = this.ma('HMA', high, this.baselineLength);
        const emaLow = this.ma('HMA', low, this.baselineLength);
        
        // Process SSL and create the result data
        const result = [];
        
        // We need to track the previous state to properly calculate the indicator
        let hlv = null;

        for (let i = 0; i < data.length; i++) {
            // SSL1 Value (This is the baseline in our implementation)
            if (hlv === null) {
                hlv = close[i] > emaHigh[i] ? 1 : close[i] < emaLow[i] ? -1 : 0;
            } else {
                hlv = close[i] > emaHigh[i] ? 1 : close[i] < emaLow[i] ? -1 : hlv;
            }
            
            // This is the key SSL calculation: when trend changes, switch which line we follow
            const sslDown = hlv < 0 ? emaHigh[i] : emaLow[i];
            
            // The color should change based on whether price is above or below the SSL line
            const color = close[i] > sslDown ? this.bullColor : this.bearColor;
            
            // Add to result
            result.push({
                time: data[i].time,
                value: sslDown,
                color: color,
                hlv: hlv
            });
        }

        return result;
    }
}