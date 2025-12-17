const { ChartJSNodeCanvas } = require('chartjs-node-canvas');

async function gerarGraficoPizza(dados, titulo, legenda) {
  const width = 800;  // px
  const height = 600; // px
  const chartJSNodeCanvas = new ChartJSNodeCanvas({ width, height });

  let labels = [];

  if (legenda === 'local') {
    labels = dados.map(item => item.local);
  } else if (legenda === 'vendedor') {
    labels = dados.map(item => item.vendedor);
  }
  
  const valores = dados.map(item =>
    Number(
      String(item.faturamento)
        .replace(/,/g, '')
        .trim()
    ) || 0
  );


  const backgroundColors = [
    '#FF6384',
    '#36A2EB',
    '#FFCE56',
    '#4BC0C0',
    '#9966FF',
    '#FF9F40',
    '#C9CBCF',
    '#FF6384',
    '#36A2EB',
    '#FFCE56'
  ];

  const config = {
    type: 'pie',
    data: {
      labels,
      datasets: [{
        data: valores,
        backgroundColor: backgroundColors
      }]
    },
    options: {
      plugins: {
        title: {
          display: true,
          text: titulo,
          font: {
            size: 24
          }
        },
        legend: {
          position: 'right'
        }
      }
    }
  };

  // Retorna a imagem em buffer PNG
  return await chartJSNodeCanvas.renderToBuffer(config);
}

module.exports = { gerarGraficoPizza };
