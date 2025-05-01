class Indicator {
    constructor(chart, type, skipInit = false) {
        this.chart = chart;
        this.type = type;
        this.id = Math.random().toString(36).substring(2, 10); // Generate a unique ID
        this.series = [];
        this.settings = {
            sma: {
                period: 20,
                color: '#2962FF'
            },
            'squeeze-momentum': {
                strongUpColor: '#00ff00',
                weakUpColor: '#008000',
                strongDownColor: '#ff0000',
                weakDownColor: '#800000'
            },
            'ssl-hybrid': {
                baselineLength: 20, // Reduced from 60 to be more responsive
                ssl2Length: 5,
                exitLength: 15,
                atrLength: 14,
                atrMultiplier: 1,
                baseChannelMultiplier: 0.2,
                continuationAtrCriteria: 0.9,
                baselineColor: '#2962FF',
                ssl1Color: '#00c3ff',
                ssl2Color: '#ffffff',
                exitColor: '#ff0062',
                atrColor: '#b2b5be',
                upperKColor: '#8097ff',
                lowerKColor: '#8097ff'
            }
        };
        this.tempSettings = {}; // For storing temporary changes
        this.element = null;
        
        // Only initialize immediately if skipInit is false
        if (!skipInit) {
            this.init();
        }
    }

    init() {
        if (this.type === 'sma') {
            const { LineSeries } = LightweightCharts;
            this.series.push(this.chart.addSeries(LineSeries, {
                color: this.settings.sma.color,
                lineWidth: 2,
                title: `MA ${this.settings.sma.period}`
            }, 0));
        } else if (this.type === 'squeeze-momentum') {
            const { HistogramSeries } = LightweightCharts;
            
            // Check if we need to create a second pane for indicators
            const panes = this.chart.panes ? this.chart.panes() : null;
            
            // If chart.panes() doesn't exist or there's only one pane, create a second pane
            if (!panes || panes.length < 2) {
                try {
                    // First check if we can get chart options to determine current height
                    const chartHeight = this.chart.options() ? this.chart.options().height : null;
                    const newPaneHeight = chartHeight ? Math.floor(chartHeight * 0.2) : 100;
                    
                    // If chart has an addPane method, use it
                    if (typeof this.chart.addPane === 'function') {
                        this.chart.addPane({ height: newPaneHeight });
                    } 
                } catch (e) {
                    console.warn("Couldn't create indicator pane:", e);
                }
            }
            
            // Add the squeeze momentum series to pane 1 (index based, 0 is the main chart pane)
            try {
                this.series.push(this.chart.addSeries(HistogramSeries, {
                    color: this.settings['squeeze-momentum'].strongUpColor,
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
            } catch (e) {
                console.error("Error adding squeeze momentum series:", e);
            }
        } else if (this.type === 'ssl-hybrid') {
            const { LineSeries } = LightweightCharts;
            const settings = this.settings['ssl-hybrid'];
            
            // Add only the baseline - we'll handle color changes in the data
            this.series.push(this.chart.addSeries(LineSeries, {
                lineWidth: 3,
                title: 'SSL Baseline',
                lastValueVisible: false
            }, 0));
        }
        
        this.createIndicatorElement();
        
        // Immediately update with chart data if available
        if (window.currentChartData) {
            this.updateData(window.currentChartData);
        }
    }

    createIndicatorElement() {
        const element = document.createElement('div');
        element.className = 'active-indicator';
        element.innerHTML = `
            <span>${this.getDisplayName()}</span>
            <span class="settings-btn"><i class="fas fa-cog"></i></span>
            <span class="delete-btn"><i class="fas fa-times"></i></span>
        `;

        element.querySelector('.settings-btn').addEventListener('click', () => {
            this.showSettings();
        });

        element.querySelector('.delete-btn').addEventListener('click', () => {
            this.remove();
        });

        document.getElementById('active-indicators').appendChild(element);
        this.element = element;
    }

    showSettings() {
        const dialog = document.getElementById('settings-dialog');
        const settingsContentId = 
            this.type === 'squeeze-momentum' ? 'squeeze-settings' : 
            this.type === 'ssl-hybrid' ? 'ssl-hybrid-settings' : 
            `${this.type}-settings`;
        const settingsContent = document.getElementById(settingsContentId);
        
        // Hide all indicator settings and show the current one
        document.querySelectorAll('.indicator-specific-settings').forEach(el => el.classList.remove('active'));
        settingsContent.classList.add('active');
        
        // Set current values
        this.tempSettings = JSON.parse(JSON.stringify(this.settings[this.type]));
        
        // Remove any existing event listeners
        this.removeSettingsEventListeners();
        
        // Setup new event listeners for dialog buttons
        const okButton = document.getElementById('settings-ok');
        const cancelButton = document.getElementById('settings-cancel');
        
        this.okHandler = () => {
            this.applySettings();
            dialog.classList.add('hidden');
            this.removeSettingsEventListeners();
        };
        
        this.cancelHandler = () => {
            this.revertChanges();
            dialog.classList.add('hidden');
            this.removeSettingsEventListeners();
        };
        
        // Add click handler for closing when clicking outside
        this.overlayHandler = (e) => {
            if (e.target === dialog) {
                this.cancelHandler();
            }
        };
        
        okButton.addEventListener('click', this.okHandler);
        cancelButton.addEventListener('click', this.cancelHandler);
        dialog.addEventListener('click', this.overlayHandler);
        
        if (this.type === 'sma') {
            const lengthInput = document.getElementById('sma-length');
            const colorInput = document.getElementById('sma-color');
            
            lengthInput.value = this.settings.sma.period;
            colorInput.value = this.settings.sma.color;
            
            this.colorHandler = (e) => {
                this.tempSettings.color = e.target.value;
                this.previewChanges();
            };
            
            this.lengthHandler = (e) => {
                this.tempSettings.period = parseInt(e.target.value);
                if (window.currentChartData) {
                    this.updateData(window.currentChartData, true);
                }
            };
            
            colorInput.addEventListener('input', this.colorHandler);
            lengthInput.addEventListener('input', this.lengthHandler);
            
        } else if (this.type === 'squeeze-momentum') {
            const colorInputs = [
                { id: 'squeeze-up-color', key: 'strongUpColor' },
                { id: 'squeeze-weak-up-color', key: 'weakUpColor' },
                { id: 'squeeze-down-color', key: 'strongDownColor' },
                { id: 'squeeze-weak-down-color', key: 'weakDownColor' }
            ];
            
            this.squeezeColorHandlers = [];
            
            colorInputs.forEach(({ id, key }) => {
                const input = document.getElementById(id);
                input.value = this.settings['squeeze-momentum'][key];
                
                const handler = (e) => {
                    this.tempSettings[key] = e.target.value;
                    this.previewChanges();
                };
                
                this.squeezeColorHandlers.push({ input, handler });
                input.addEventListener('input', handler);
            });
        } else if (this.type === 'ssl-hybrid') {
            // Set up SSL Hybrid settings
            this.sslInputHandlers = [];
            
            // Length settings
            const baselineLengthInput = document.getElementById('ssl-baseline-length');
            const ssl2LengthInput = document.getElementById('ssl-ssl2-length');
            const exitLengthInput = document.getElementById('ssl-exit-length');
            
            // Color settings
            const baselineColorInput = document.getElementById('ssl-baseline-color');
            const ssl2ColorInput = document.getElementById('ssl-ssl2-color');
            const exitColorInput = document.getElementById('ssl-exit-color');
            
            // Set initial values
            baselineLengthInput.value = this.settings['ssl-hybrid'].baselineLength;
            ssl2LengthInput.value = this.settings['ssl-hybrid'].ssl2Length;
            exitLengthInput.value = this.settings['ssl-hybrid'].exitLength;
            baselineColorInput.value = this.settings['ssl-hybrid'].baselineColor;
            ssl2ColorInput.value = this.settings['ssl-hybrid'].ssl2Color;
            exitColorInput.value = this.settings['ssl-hybrid'].exitColor;
            
            // Set up handlers for each input
            const inputs = [
                { input: baselineLengthInput, key: 'baselineLength', isNumber: true },
                { input: ssl2LengthInput, key: 'ssl2Length', isNumber: true },
                { input: exitLengthInput, key: 'exitLength', isNumber: true },
                { input: baselineColorInput, key: 'baselineColor', isNumber: false },
                { input: ssl2ColorInput, key: 'ssl2Color', isNumber: false },
                { input: exitColorInput, key: 'exitColor', isNumber: false }
            ];
            
            inputs.forEach(({ input, key, isNumber }) => {
                const handler = (e) => {
                    this.tempSettings[key] = isNumber ? parseInt(e.target.value) : e.target.value;
                    if (window.currentChartData) {
                        this.updateData(window.currentChartData, true);
                    }
                };
                
                this.sslInputHandlers.push({ input, handler });
                input.addEventListener('input', handler);
            });
        }
        
        dialog.classList.remove('hidden');
    }
    
    removeSettingsEventListeners() {
        const dialog = document.getElementById('settings-dialog');
        const okButton = document.getElementById('settings-ok');
        const cancelButton = document.getElementById('settings-cancel');
        
        if (this.okHandler) {
            okButton.removeEventListener('click', this.okHandler);
        }
        if (this.cancelHandler) {
            cancelButton.removeEventListener('click', this.cancelHandler);
        }
        if (this.overlayHandler) {
            dialog.removeEventListener('click', this.overlayHandler);
        }
        
        if (this.type === 'sma') {
            const lengthInput = document.getElementById('sma-length');
            const colorInput = document.getElementById('sma-color');
            
            if (this.colorHandler) {
                colorInput.removeEventListener('input', this.colorHandler);
            }
            if (this.lengthHandler) {
                lengthInput.removeEventListener('input', this.lengthHandler);
            }
        } else if (this.type === 'squeeze-momentum' && this.squeezeColorHandlers) {
            this.squeezeColorHandlers.forEach(({ input, handler }) => {
                input.removeEventListener('input', handler);
            });
            this.squeezeColorHandlers = [];
        } else if (this.type === 'ssl-hybrid' && this.sslInputHandlers) {
            this.sslInputHandlers.forEach(({ input, handler }) => {
                input.removeEventListener('input', handler);
            });
            this.sslInputHandlers = [];
        }
    }

    previewChanges() {
        if (this.type === 'sma') {
            this.series[0].applyOptions({ 
                color: this.tempSettings.color,
                title: `MA ${this.tempSettings.period}`
            });
            if (window.currentChartData) {
                this.updateData(window.currentChartData, true);
            }
        } else if (this.type === 'squeeze-momentum') {
            if (window.currentChartData) {
                this.updateData(window.currentChartData, true);
            }
        }
    }

    revertChanges() {
        if (this.type === 'sma') {
            this.series[0].applyOptions({ 
                color: this.settings.sma.color,
                title: `MA ${this.settings.sma.period}`
            });
        }
        if (window.currentChartData) {
            this.updateData(window.currentChartData);
        }
    }

    applySettings() {
        if (this.type === 'sma') {
            const newPeriod = parseInt(document.getElementById('sma-length').value);
            const newColor = document.getElementById('sma-color').value;
            
            this.settings.sma.period = newPeriod;
            this.settings.sma.color = newColor;
            
            this.series[0].applyOptions({
                color: newColor,
                title: `MA ${newPeriod}`
            });
        } else if (this.type === 'squeeze-momentum') {
            Object.assign(this.settings['squeeze-momentum'], this.tempSettings);
        } else if (this.type === 'ssl-hybrid') {
            // Get values from the settings inputs
            const baselineLength = parseInt(document.getElementById('ssl-baseline-length').value);
            const ssl2Length = parseInt(document.getElementById('ssl-ssl2-length').value);
            const exitLength = parseInt(document.getElementById('ssl-exit-length').value);
            const baselineColor = document.getElementById('ssl-baseline-color').value;
            const ssl2Color = document.getElementById('ssl-ssl2-color').value;
            const exitColor = document.getElementById('ssl-exit-color').value;
            
            // Update the settings object
            Object.assign(this.settings['ssl-hybrid'], {
                baselineLength: baselineLength,
                ssl2Length: ssl2Length,
                exitLength: exitLength,
                baselineColor: baselineColor,
                ssl2Color: ssl2Color,
                exitColor: exitColor
            });
            
            // Apply options to series
            this.series[0].applyOptions({ 
                color: baselineColor,
                title: `SSL Baseline ${baselineLength}`
            });
        }
        
        if (window.currentChartData) {
            this.updateData(window.currentChartData);
        }
    }

    getDisplayName() {
        switch(this.type) {
            case 'sma':
                return `MA ${this.settings.sma.period}`;
            case 'squeeze-momentum':
                return 'Squeeze Momentum';
            case 'ssl-hybrid':
                return 'SSL Hybrid';
            default:
                return this.type.toUpperCase();
        }
    }

    updateData(chartData, preview = false) {
        if (this.type === 'sma') {
            const settings = preview ? this.tempSettings : this.settings.sma;
            const smaIndicator = new SMAIndicator(settings.period);
            const smaData = smaIndicator.calculate(chartData);
            this.series[0].setData(smaData);
        } else if (this.type === 'squeeze-momentum') {
            const squeezeIndicator = new SqueezeIndicator();
            const squeezeData = squeezeIndicator.calculate(chartData);

            const settings = preview ? this.tempSettings : this.settings['squeeze-momentum'];
            const histogramData = squeezeData.map(item => ({
                time: item.time,
                value: item.value,
                color: this.getHistogramColor(item, settings)
            }));

            const dotsData = squeezeData.map(item => ({
                time: item.time,
                value: 0,
                color: this.getSqueezeStateColor(item)
            }));

            this.series[0].setData(histogramData);
            this.series[1].setData(dotsData);
        } else if (this.type === 'ssl-hybrid') {
            const sslIndicator = new SSLHybridIndicator();
            const settings = preview ? this.tempSettings : this.settings['ssl-hybrid'];
            
            // Apply settings from our config
            sslIndicator.baselineLength = settings.baselineLength;
            
            // Calculate indicator data
            const sslData = sslIndicator.calculate(chartData);
            
            // For SSL Hybrid, we only need one series with colored data points
            // Each data point can have its own color
            const lineData = sslData.map(item => ({
                time: item.time,
                value: item.value,
                color: item.color
            }));
            
            this.series[0].setData(lineData);
        }
    }

    getHistogramColor(item, settings = this.settings['squeeze-momentum']) {
        switch(item.momentum) {
            case 'strong_up': return settings.strongUpColor;
            case 'weak_up': return settings.weakUpColor;
            case 'strong_down': return settings.strongDownColor;
            case 'weak_down': return settings.weakDownColor;
            default: return '#808080';
        }
    }

    getSqueezeStateColor(item) {
        if (item.sqzOn) return '#000000';
        if (item.sqzOff) return '#808080';
        return '#0000ff';
    }

    remove() {
        // First remove all series from the chart
        this.series.forEach(series => {
            try {
                this.chart.removeSeries(series);
            } catch(e) {
                console.warn("Error removing series:", e);
            }
        });

        // Clear the series array to prevent potential double application issues
        this.series = [];
        
        // Remove UI element
        if (this.element) {
            this.element.remove();
            this.element = null;
        }
        
        // Add this indicator's ID to the global removedIndicatorIds Set
        window.removedIndicatorIds = window.removedIndicatorIds || new Set();
        window.removedIndicatorIds.add(this.id);
        
        // Remove from global instances array
        const index = indicatorInstances.indexOf(this);
        if (index > -1) {
            indicatorInstances.splice(index, 1);
        }
    }
}