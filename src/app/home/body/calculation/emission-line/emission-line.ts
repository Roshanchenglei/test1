import { Component } from '@angular/core';
import * as Plotly from 'plotly.js-dist-min';

@Component({
  selector: 'app-emission-line',
  standalone: false,
  templateUrl: './emission-line.html',
  styleUrl: './emission-line.css'
})
export class EmissionLine {
  fitStats: any;
  xData: number[] = [];
  yData: number[] = [];
  fileContent: string = '';
  continuumRanges: string = '';
  name: string = '';
  fitData: number[] = [];

  input = {
    amplitude: 0,
    spectral_index: 0,
    a1: 0, a2: 0,
    b1: 0, b2: 0,
    c1: 0, c2: 0,
    lower_limit: 0,
    upper_limit: 0,
    rest_wavelength: 0
  };

inputError = {
  a1: 5,
  a2: 2.5,
  c1: 0.2,
  c2: 0.1,
  amplitude: 1
};
analysisResults: any=null;

  onFileUpload(event: any) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const lines = (reader.result as string).trim().split('\n');
      this.xData = [];
      this.yData = [];
      for (const line of lines) {
        const [x, y] = line.trim().split(/\s+/).map(Number);
        if (!isNaN(x) && !isNaN(y)) {
          this.xData.push(x);
          this.yData.push(y);
        }
      }
    };
    reader.readAsText(file);
  }

  processContinuum() {
    const ranges = this.continuumRanges.split(',').map(r => r.split(':').map(Number));
    let xCont: number[] = [];
    let yCont: number[] = [];

    for (const [start, end] of ranges) {
      xCont.push(...this.xData.slice(start, end));
      yCont.push(...this.yData.slice(start, end));
    }

    const logX = xCont.map(x => Math.log(x));
    const logY = yCont.map(y => Math.log(y));
    const n = logX.length;
    const sumX = logX.reduce((a, b) => a + b, 0);
    const sumY = logY.reduce((a, b) => a + b, 0);
    const sumXY = logX.reduce((acc, x, i) => acc + x * logY[i], 0);
    const sumX2 = logX.reduce((acc, x) => acc + x * x, 0);

    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;
    const amplitude = Math.exp(intercept);

    this.input.amplitude = amplitude;
    this.input.spectral_index = slope;

    const continuum = this.xData.map(x => amplitude * Math.pow(x, slope));
    const subtracted = this.yData.map((y, i) => y - continuum[i]);

    const residuals = logY.map((y, i) => y - (slope * logX[i] + intercept));
    const variance = residuals.reduce((a, b) => a + b * b, 0) / (n - 2);
    const slopeError = Math.sqrt(variance / (sumX2 - (sumX * sumX) / n));
    const interceptError = Math.sqrt(variance * (1 / n + (sumX * sumX) / (n * (sumX2 - (sumX * sumX) / n))));
    const amplitudeError = amplitude * interceptError;

    const modelY = xCont.map(x => amplitude * Math.pow(x, slope));
    const chiSq = yCont.reduce((acc, y, i) => acc + Math.pow((y - modelY[i]), 2) / y, 0);
    const chiSqError = Math.sqrt(2 * chiSq);

    this.fitStats = {
      spectralIndex: slope.toFixed(4),
      spectralIndexError: slopeError.toExponential(2),
      amplitude: amplitude.toExponential(4),
      amplitudeError: amplitudeError.toExponential(2),
      chiSq: chiSq.toFixed(2),
      chiSqError: chiSqError.toFixed(2)
    };

    this.plotSpectrum(this.xData, this.yData, continuum, subtracted, xCont, yCont);
  }

  plotSpectrum(x: number[], original: number[], continuum: number[], subtracted: number[], xCont: number[], yCont: number[]) {
    const data: Partial<Plotly.PlotData>[] = [
      { x, y: original, type: 'scatter', mode: 'lines', name: 'Before Continuum Subtraction', line: { color: 'blue' } },
      { x, y: continuum, type: 'scatter', mode: 'lines', name: 'Continuum Fit', line: { color: 'green' } },
      { x: xCont, y: yCont, type: 'scatter', mode: 'markers', name: 'Continuum Windows', marker: { color: 'red', size: 6 } },
      { x, y: subtracted, type: 'scatter', mode: 'lines', name: 'After Subtraction', line: { color: 'orange' } }
    ];

    const layout: Partial<Plotly.Layout> = {
      title: { text: `${this.name} - Continuum Subtraction`, font: { size: 18 } },
      xaxis: { title: { text: 'Wavelength (Å)', font: { size: 16 } }, tickfont: { size: 14 } },
      yaxis: {
        title: { text: 'Flux (erg cm⁻² s⁻¹ Å⁻¹)', font: { size: 16 } },
        tickfont: { size: 14 }, showline: true, linewidth: 2, ticks: 'outside', ticklen: 6,
        exponentformat: 'e', showexponent: 'all', tickformat: '.1e'
      },
      legend: { orientation: 'h', x: 0.5, xanchor: 'center', y: -0.3 },
      margin: { t: 50, b: 80, l: 100, r: 20 }
    };

    Plotly.newPlot('continuumPlot', data, layout);
  }

  plotEmissionFit() {
    const continuum = this.xData.map(x => this.input.amplitude * Math.pow(x, this.input.spectral_index));
    const ySubtracted = this.yData.map((y, i) => y - continuum[i]);

    const fitData = this.xData.map(x =>
      this.gaussian(x, this.input.a1, this.input.b1, this.input.c1) +
      this.gaussian(x, this.input.a2, this.input.b2, this.input.c2)
    );

    const data: Partial<Plotly.PlotData>[] = [
      { x: this.xData, y: ySubtracted, type: 'scatter', mode: 'lines', name: 'Continuum Subtracted', line: { color: 'orange' } },
      { x: this.xData, y: fitData, type: 'scatter', mode: 'lines', name: 'Gaussian Fit', line: { color: 'purple' } }
    ];

    const layout: Partial<Plotly.Layout> = {
      title: { text: 'Emission Line Fit', font: { size: 18 } },
      xaxis: { title: { text: 'Wavelength (Å)', font: { size: 16 } }, tickfont: { size: 14 } },
      yaxis: {
        title: { text: 'Flux', font: { size: 16 } }, tickfont: { size: 14 },
        showline: true, linewidth: 2, ticks: 'outside', ticklen: 6
      },
      margin: { t: 50, b: 80, l: 80, r: 20 },
      plot_bgcolor: '#fff', paper_bgcolor: '#fff',
      legend: { orientation: 'h', x: 0.5, xanchor: 'center', y: -0.3 }
    };

    Plotly.newPlot('emission-fit-plot', data, layout as any, { responsive: true });
  }

  analyze() {
    const {
      amplitude, spectral_index,
      a1, a2, b1, b2, c1, c2,
      lower_limit, upper_limit,
      rest_wavelength
    } = this.input;

    const dx = this.xData[1] - this.xData[0];

    // Flux integrals
    const flux_broad = this.xData.reduce((sum, x) =>
      x >= lower_limit && x <= upper_limit ? sum + this.gaussian(x, a1, b1, c1) * dx : sum, 0);
    const flux_narrow = this.xData.reduce((sum, x) =>
      x >= lower_limit && x <= upper_limit ? sum + this.gaussian(x, a2, b2, c2) * dx : sum, 0);

    // Continuum flux at line center
    const continuum = this.xData.map(x => amplitude * Math.pow(x, spectral_index));
    const idx_b1 = this.xData.findIndex(x => x >= b1);
    const idx_b2 = this.xData.findIndex(x => x >= b2);
    const cont_flux_broad = continuum[idx_b1];
    const cont_flux_narrow = continuum[idx_b2];

    // EW
    const ew_broad = flux_broad / cont_flux_broad;
    const ew_narrow = flux_narrow / cont_flux_narrow;
    const ew_total = ew_broad + ew_narrow;

    // FWHM in Angstroms and km/s
    const fwhm_ang_broad = 2.3548 * c1;
    const fwhm_ang_narrow = 2.3548 * c2;
    const fwhm_km_broad = fwhm_ang_broad * 299792.458 / rest_wavelength;
    const fwhm_km_narrow = fwhm_ang_narrow * 299792.458 / rest_wavelength;

    console.log("Flux Broad:", flux_broad.toExponential(3));
    console.log("Flux Narrow:", flux_narrow.toExponential(3));
    console.log("EW Broad:", ew_broad.toFixed(2), "Å");
    console.log("EW Narrow:", ew_narrow.toFixed(2), "Å");
    console.log("EW Total:", ew_total.toFixed(2), "Å");
    console.log("FWHM Broad:", fwhm_km_broad.toFixed(1), "km/s");
    console.log("FWHM Narrow:", fwhm_km_narrow.toFixed(1), "km/s");

    this.plotEmissionFit();
    this.analysisResults = {
      fluxBroad: flux_broad.toExponential(3),
      fluxNarrow: flux_narrow.toExponential(3),
      ewBroad: ew_broad.toFixed(2),
      ewNarrow: ew_narrow.toFixed(2),
      ewTotal: ew_total.toFixed(2),
      fwhmAngBroad: fwhm_ang_broad.toFixed(2),
      fwhmAngNarrow: fwhm_ang_narrow.toFixed(2),
      fwhmKmBroad: fwhm_km_broad.toFixed(1),
      fwhmKmNarrow: fwhm_km_narrow.toFixed(1)
};
// 1. Get the continuum-subtracted data
const ySubtracted = this.yData.map((y, i) => y - continuum[i]);

// 2. Compute the fit model using 2 Gaussians
const fit_model = this.xData.map(x =>
  this.gaussian(x, a1, b1, c1) + this.gaussian(x, a2, b2, c2)
);

// 3. Restrict to the emission line region
let chiSquared = 0;
let count = 0;
for (let i = 0; i < this.xData.length; i++) {
  const x = this.xData[i];
  if (x >= lower_limit && x <= upper_limit) {
    const residual = ySubtracted[i] - fit_model[i];
    const error = ySubtracted[i] > 0 ? Math.sqrt(ySubtracted[i]) : 1;  // use Poisson error or fallback
    chiSquared += (residual ** 2) / (error ** 2);
    count++;
  }
}

// 4. Calculate reduced chi-squared
const dof = count - 6;  // 6 fitted parameters (a1,a2,b1,b2,c1,c2)
const reducedChiSq = chiSquared / dof;

// --- Flux Errors ---
const fluxErrBroad = a1 * c1 * Math.sqrt(Math.pow(this.inputError.a1 / a1, 2) + Math.pow(this.inputError.c1 / c1, 2));
const fluxErrNarrow = a2 * c2 * Math.sqrt(Math.pow(this.inputError.a2 / a2, 2) + Math.pow(this.inputError.c2 / c2, 2));

// --- EW Errors ---
const ewErrBroad = ew_broad * Math.sqrt(
  Math.pow(this.inputError.a1 / a1, 2) +
  Math.pow(this.inputError.c1 / c1, 2) +
  Math.pow(this.inputError.amplitude / amplitude, 2)
);

const ewErrNarrow = ew_narrow * Math.sqrt(
  Math.pow(this.inputError.a2 / a2, 2) +
  Math.pow(this.inputError.c2 / c2, 2) +
  Math.pow(this.inputError.amplitude / amplitude, 2)
);


this.analysisResults = {
  fluxBroad: flux_broad.toExponential(3),
  fluxErrBroad: fluxErrBroad.toExponential(3),   // ✅ Added
  fluxNarrow: flux_narrow.toExponential(3),
  fluxErrNarrow: fluxErrNarrow.toExponential(3), // ✅ Added
  ewBroad: ew_broad.toFixed(2),
  ewErrBroad: ewErrBroad.toFixed(2),
  ewNarrow: ew_narrow.toFixed(2),
  ewErrNarrow: ewErrNarrow.toFixed(2),
  ewTotal: ew_total.toFixed(2),
  total_ew: ew_total.toFixed(2),
  fwhmAngBroad: fwhm_ang_broad.toFixed(2),
  fwhmAngNarrow: fwhm_ang_narrow.toFixed(2),
  fwhmKmBroad: fwhm_km_broad.toFixed(1),
  fwhmKmNarrow: fwhm_km_narrow.toFixed(1),
  chiSquared: reducedChiSq.toFixed(2)
};


    
  }

  gaussian(x: number, a: number, b: number, c: number): number {
    return a * Math.exp(-Math.pow(x - b, 2) / (2 * c * c));
  }

}