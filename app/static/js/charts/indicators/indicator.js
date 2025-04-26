/**
 * Base Indicator class that all chart indicators extend
 * Provides common functionality for all indicators
 */
class Indicator {
    constructor(id, chart, series, options = {}) {
        this.id = id;
        this.chart = chart;
        this.sourceSeries = series;
        this.options = this.mergeOptions(options);
        this.visible = true;
        this.series = null;
        this.params = this.getDefaultParams();
    }

    /**
     * Merge default options with user-provided options
     */
    mergeOptions(userOptions) {
        return { ...this.getDefaultOptions(), ...userOptions };
    }

    /**
     * Get default options for this indicator
     * Should be overridden by child classes
     */
    getDefaultOptions() {
        return {};
    }

    /**
     * Get default parameters for this indicator
     * Should be overridden by child classes
     */
    getDefaultParams() {
        return {};
    }

    /**
     * Set indicator parameters
     */
    setParams(params) {
        this.params = { ...this.getDefaultParams(), ...params };
        this.update();
        return this;
    }

    /**
     * Calculate the indicator values
     * Should be overridden by child classes
     */
    calculate(data) {
        // Override in child class
        return data;
    }

    /**
     * Create the series on the chart
     * Should be overridden by child classes
     */
    createSeries() {
        // Override in child class
    }

    /**
     * Update the indicator with new data
     */
    update() {
        if (!this.sourceSeries || !this.series) return this;
        
        // Get the source data (usually price data)
        // Lightweight Charts doesn't provide a .data() method directly on series
        // We should use the lastData array from the chart instance instead
        const sourceData = window.lastData || [];
        
        if (sourceData.length === 0) {
            console.warn('No data available for indicator calculation');
            return this;
        }
        
        // Calculate the indicator values
        const indicatorData = this.calculate(sourceData);
        
        // Update the series with new data
        if (Array.isArray(indicatorData)) {
            this.series.setData(indicatorData);
        }
        
        return this;
    }

    /**
     * Initialize the indicator
     */
    init() {
        // Create the series if it doesn't exist
        if (!this.series) {
            this.createSeries();
        }
        
        // Update with initial data
        this.update();
        
        return this;
    }

    /**
     * Show/hide the indicator
     */
    setVisible(visible) {
        this.visible = visible;
        if (this.series) {
            this.series.applyOptions({
                visible: visible
            });
        }
        
        return this;
    }

    /**
     * Remove the indicator from the chart
     */
    remove() {
        if (this.series) {
            this.chart.removeSeries(this.series);
            this.series = null;
        }
        return this;
    }

    /**
     * Get indicator name for displaying in UI
     * Should be overridden by child classes
     */
    getName() {
        return 'Base Indicator';
    }

    /**
     * Get unique indicator type identifier
     * Should be overridden by child classes
     */
    getType() {
        return 'base_indicator';
    }
}