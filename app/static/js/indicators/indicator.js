class Indicator {
    constructor(chart, type) {
        this.chart = chart;
        this.type = type;
        this.series = [];
        this.init();
    }

    init() {
        if (this.type === 'sma') {
            const { LineSeries } = LightweightCharts;
            // Single SMA with 20 period
            const period = 20;
            const color = '#2962FF';
            
            this.series.push(this.chart.addSeries(LineSeries, {
                color: color,
                lineWidth: 2,
                title: `MA ${period}`
            }, 0));
        } else if (this.type === 'squeeze-momentum') {
            const { HistogramSeries } = LightweightCharts;
            this.series.push(this.chart.addSeries(HistogramSeries, {
                color: '#26a69a',
                base: 0,
                lineWidth: 4,
                title: 'Squeeze Mo'
            }, 1));
            this.series.push(this.chart.addSeries(HistogramSeries, {
                color: 'blue',
                base: 0,
                lineWidth: 2,
                title: 'Squeeze'
            }, 1));
        }
        
        this.createIndicatorElement();
    }

    createIndicatorElement() {
        const element = document.createElement('div');
        element.className = 'active-indicator';
        element.innerHTML = `
            <span>${this.getDisplayName()}</span>
            <span class="settings-btn"><i class="fas fa-cog"></i></span>
            <span class="delete-btn"><i class="fas fa-times"></i></span>
        `;

        // Add event listeners for buttons
        element.querySelector('.settings-btn').addEventListener('click', () => {
            // Settings functionality will be added later
        });

        element.querySelector('.delete-btn').addEventListener('click', () => {
            this.remove();
        });

        document.getElementById('active-indicators').appendChild(element);
        this.element = element;
    }

    getDisplayName() {
        switch(this.type) {
            case 'sma':
                return 'Moving Average';
            case 'squeeze-momentum':
                return 'Squeeze Momentum';
            default:
                return this.type.toUpperCase();
        }
    }

    updateData(chartData) {
        if (this.type === 'sma') {
            const smaIndicator = new SMAIndicator(20);
            const smaData = smaIndicator.calculate(chartData);
            this.series[0].setData(smaData);
        } else if (this.type === 'squeeze-momentum') {
            const squeezeIndicator = new SqueezeIndicator();
            const squeezeData = squeezeIndicator.calculate(chartData);

            const histogramData = squeezeData.map(item => ({
                time: item.time,
                value: item.value,
                color: this.getHistogramColor(item)
            }));

            const dotsData = squeezeData.map(item => ({
                time: item.time,
                value: 0,
                color: this.getSqueezeStateColor(item)
            }));

            this.series[0].setData(histogramData);
            this.series[1].setData(dotsData);
        }
    }

    getHistogramColor(item) {
        switch(item.momentum) {
            case 'strong_up': return '#00ff00';
            case 'weak_up': return '#008000';
            case 'strong_down': return '#ff0000';
            case 'weak_down': return '#800000';
            default: return '#808080';
        }
    }

    getSqueezeStateColor(item) {
        if (item.sqzOn) return '#000000';
        if (item.sqzOff) return '#808080';
        return '#0000ff';
    }

    remove() {
        // Remove series from chart
        this.series.forEach(series => this.chart.removeSeries(series));
        // Remove UI element
        if (this.element) {
            this.element.remove();
        }
        // Remove from instances array
        const index = indicatorInstances.indexOf(this);
        if (index > -1) {
            indicatorInstances.splice(index, 1);
        }
    }
}