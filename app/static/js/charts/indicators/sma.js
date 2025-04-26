/**
 * Simple Moving Average (SMA) indicator
 * Calculates the average of a selected range of prices over a defined number of periods
 */
class SMAIndicator extends Indicator {
    /**
     * Get default options for SMA
     */
    getDefaultOptions() {
        return {
            color: '#2962FF',
            lineWidth: 2,
            lineStyle: 0, // Solid line
            priceScaleId: 'right'
        };
    }

    /**
     * Get default parameters for SMA
     */
    getDefaultParams() {
        return {
            length: 20, // Default period length
            source: 'close' // Default price source
        };
    }

    /**
     * Create the series on the chart
     */
    createSeries() {
        this.series = this.chart.addLineSeries({
            color: this.options.color,
            lineWidth: this.options.lineWidth,
            lineStyle: this.options.lineStyle,
            priceScaleId: this.options.priceScaleId,
            title: `SMA (${this.params.length})`
        });
    }

    /**
     * Calculate SMA values
     * @param {Array} data - Price data
     * @returns {Array} - Calculated SMA values
     */
    calculate(data) {
        const length = this.params.length;
        const source = this.params.source;
        
        if (!data || data.length === 0 || length <= 0) {
            return [];
        }
        
        const result = [];
        let sum = 0;
        
        // Calculate SMA
        for (let i = 0; i < data.length; i++) {
            const price = data[i][source];
            
            // Skip if price is not available
            if (typeof price !== 'number') {
                continue;
            }
            
            sum += price;
            
            if (i >= length) {
                // Subtract oldest price that's no longer in the window
                const oldestPrice = data[i - length][source];
                if (typeof oldestPrice === 'number') {
                    sum -= oldestPrice;
                }
            }
            
            if (i >= length - 1) {
                // We have enough data points to calculate SMA
                result.push({
                    time: data[i].time,
                    value: sum / length
                });
            } else {
                // Not enough data points yet, add null value
                result.push({
                    time: data[i].time,
                    value: null
                });
            }
        }
        
        return result;
    }

    /**
     * Get indicator name for UI
     */
    getName() {
        return `SMA (${this.params.length})`;
    }

    /**
     * Get indicator type
     */
    getType() {
        return 'sma';
    }
}