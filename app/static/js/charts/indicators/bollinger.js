/**
 * Bollinger Bands indicator
 * Plots upper, middle (SMA), and lower bands based on standard deviation
 */
class BollingerBandsIndicator extends Indicator {
    /**
     * Get default options for Bollinger Bands
     */
    getDefaultOptions() {
        return {
            color: '#FFA000', // Middle band color
            upperColor: '#00B8D9',
            lowerColor: '#FF5630',
            lineWidth: 2,
            lineStyle: 0, // Solid line
            priceScaleId: 'right'
        };
    }

    /**
     * Get default parameters for Bollinger Bands
     */
    getDefaultParams() {
        return {
            length: 20, // Period
            source: 'close',
            stdDev: 2 // Standard deviation multiplier
        };
    }

    /**
     * Create the series on the chart (3 lines)
     */
    createSeries() {
        this.middleSeries = this.chart.addLineSeries({
            color: this.options.color,
            lineWidth: this.options.lineWidth,
            lineStyle: this.options.lineStyle,
            priceScaleId: this.options.priceScaleId,
            title: `BB Middle (${this.params.length})`
        });
        this.upperSeries = this.chart.addLineSeries({
            color: this.options.upperColor,
            lineWidth: 1,
            lineStyle: this.options.lineStyle,
            priceScaleId: this.options.priceScaleId,
            title: `BB Upper (${this.params.length})`
        });
        this.lowerSeries = this.chart.addLineSeries({
            color: this.options.lowerColor,
            lineWidth: 1,
            lineStyle: this.options.lineStyle,
            priceScaleId: this.options.priceScaleId,
            title: `BB Lower (${this.params.length})`
        });
        this.series = this.middleSeries; // For compatibility
    }

    /**
     * Calculate Bollinger Bands values
     * @param {Array} data - Price data
     * @returns {Array} - Not used (bands are set directly)
     */
    calculate(data) {
        const length = this.params.length;
        const source = this.params.source;
        const stdDevMult = this.params.stdDev;
        if (!data || data.length === 0 || length <= 0) return [];
        const middle = [], upper = [], lower = [];
        for (let i = 0; i < data.length; i++) {
            if (i < length - 1) {
                middle.push({ time: data[i].time, value: null });
                upper.push({ time: data[i].time, value: null });
                lower.push({ time: data[i].time, value: null });
                continue;
            }
            let sum = 0, sumSq = 0;
            for (let j = i - length + 1; j <= i; j++) {
                const price = data[j][source];
                sum += price;
                sumSq += price * price;
            }
            const mean = sum / length;
            const variance = (sumSq / length) - (mean * mean);
            const std = Math.sqrt(variance);
            middle.push({ time: data[i].time, value: mean });
            upper.push({ time: data[i].time, value: mean + stdDevMult * std });
            lower.push({ time: data[i].time, value: mean - stdDevMult * std });
        }
        // Set data for each band
        if (this.middleSeries) this.middleSeries.setData(middle);
        if (this.upperSeries) this.upperSeries.setData(upper);
        if (this.lowerSeries) this.lowerSeries.setData(lower);
        // Return middle band for compatibility
        return middle;
    }

    /**
     * Get indicator name for UI
     */
    getName() {
        return `Bollinger Bands (${this.params.length}, ${this.params.stdDev})`;
    }

    /**
     * Get indicator type
     */
    getType() {
        return 'bollinger';
    }

    /**
     * Remove all series from chart
     */
    remove() {
        if (this.middleSeries) this.chart.removeSeries(this.middleSeries);
        if (this.upperSeries) this.chart.removeSeries(this.upperSeries);
        if (this.lowerSeries) this.chart.removeSeries(this.lowerSeries);
        this.middleSeries = this.upperSeries = this.lowerSeries = null;
        this.series = null;
        return this;
    }
}
