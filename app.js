// Variáveis Globais para armazenar os dados e camadas
let map;
let allLotesGeoJSON = { type: 'FeatureCollection', features: [] }; // Armazena todos os lotes carregados
let allAPPGeoJSON = { type: 'FeatureCollection', features: [] };   // Armazena todas as APPs carregadas
let allPoligonaisGeoJSON = { type: 'FeatureCollection', features: [] }; // Armazena outras poligonais (infraestrutura, etc.)

// Camadas Leaflet no mapa
let lotesLayer = null;
let appLayer = null;
let poligonaisLayer = null;

// Mapa de estilos para riscos
const riscoStyles = {
    'Baixo': { fillColor: '#2ecc71', color: 'white' },        // Verde
    'Médio': { fillColor: '#f39c12', color: 'white' },        // Laranja
    'Alto': { fillColor: '#e74c3c', color: 'white' },         // Vermelho
    'Muito Alto': { fillColor: '#c0392b', color: 'white' },   // Vermelho escuro
    'N/A': { fillColor: '#3498db', color: 'white' }           // Azul padrão para risco não definido
};

// 1. Inicializa o Mapa
function initMap() {
    map = L.map('mapid').setView([-15.7801, -47.9292], 5); // Coordenadas do centro do Brasil

    // Basemap OpenStreetMap (Padrão)
    const osmLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    });
    osmLayer.addTo(map);

    // Basemap Esri World Imagery (Satélite)
    const esriWorldImagery = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
    });

    // Controle de camadas base para o usuário escolher o basemap
    const baseMaps = {
        "OpenStreetMap": osmLayer,
        "Esri World Imagery": esriWorldImagery
    };
    L.control.layers(baseMaps).addTo(map);

    // Adiciona listeners para os checkboxes da legenda personalizada
    document.getElementById('toggleLotes').addEventListener('change', (e) => toggleLayerVisibility(lotesLayer, e.target.checked));
    document.getElementById('togglePoligonais').addEventListener('change', (e) => toggleLayerVisibility(poligonaisLayer, e.target.checked));
    document.getElementById('toggleAPP').addEventListener('change', (e) => toggleLayerVisibility(appLayer, e.target.checked));
}

// Função para ligar/desligar a visibilidade da camada no mapa
function toggleLayerVisibility(layer, isVisible) {
    if (layer) {
        if (isVisible && !map.hasLayer(layer)) {
            layer.addTo(map);
        } else if (!isVisible && map.hasLayer(layer)) {
            map.removeLayer(layer);
        }
    }
}

// 2. Navegação entre Seções
document.querySelectorAll('nav a').forEach(link => {
    link.addEventListener('click', function(e) {
        e.preventDefault();
        const targetSectionId = this.getAttribute('data-section');

        // Remove 'active' de todas as seções e links
        document.querySelectorAll('main section').forEach(section => {
            section.classList.remove('active');
        });
        document.querySelectorAll('nav a').forEach(navLink => {
            navLink.classList.remove('active');
        });

        // Adiciona 'active' à seção e link clicados
        document.getElementById(targetSectionId).classList.add('active');
        this.classList.add('active');

        // Invalida o tamanho do mapa se a seção do dashboard for ativada (garante que o mapa renderize corretamente)
        if (targetSectionId === 'dashboard' && map) {
            map.invalidateSize();
        }
    });
});

// 3. Funções de Upload e Processamento de GeoJSON
document.addEventListener('DOMContentLoaded', () => {
    initMap(); // Inicializa o mapa ao carregar a página
    setupFileUpload(); // Configura o upload de arquivos
    // Garante que o dashboard esteja visível por padrão ao carregar a página
    document.getElementById('dashboard').classList.add('active');
    document.querySelector('nav a[data-section="dashboard"]').classList.add('active');
});

function setupFileUpload() {
    const fileInput = document.getElementById('geojsonFileInput');
    const dragDropArea = document.querySelector('.drag-drop-area');
    const fileListElement = document.getElementById('fileList');
    const processAndLoadBtn = document.getElementById('processAndLoadBtn');
    const uploadStatus = document.getElementById('uploadStatus');

    let selectedFiles = []; // Array para armazenar os arquivos GeoJSON selecionados

    // Lida com a seleção de arquivos via input
    fileInput.addEventListener('change', (e) => {
        selectedFiles = Array.from(e.target.files);
        displaySelectedFiles(selectedFiles);
    });

    // Lida com o arrastar e soltar
    dragDropArea.addEventListener('dragover', (e) => {
        e.preventDefault(); // Necessário para permitir o drop
        dragDropArea.classList.add('dragging');
    });
    dragDropArea.addEventListener('dragleave', () => {
        dragDropArea.classList.remove('dragging');
    });
    dragDropArea.addEventListener('drop', (e) => {
        e.preventDefault();
        dragDropArea.classList.remove('dragging');
        selectedFiles = Array.from(e.dataTransfer.files).filter(file => file.name.endsWith('.geojson') || file.name.endsWith('.json'));
        displaySelectedFiles(selectedFiles);
    });

    // Exibe os nomes dos arquivos selecionados na lista
    function displaySelectedFiles(files) {
        fileListElement.innerHTML = ''; // Limpa a lista
        if (files.length === 0) {
            fileListElement.innerHTML = '<li>Nenhum arquivo selecionado.</li>';
        } else {
            files.forEach(file => {
                const li = document.createElement('li');
                li.textContent = file.name;
                fileListElement.appendChild(li);
            });
        }
    }

    // Botão Processar e Carregar Dados
    processAndLoadBtn.addEventListener('click', async () => {
        if (selectedFiles.length === 0) {
            uploadStatus.textContent = 'Nenhum arquivo para processar. Por favor, selecione arquivos GeoJSON.';
            uploadStatus.className = 'status-message error';
            return;
        }

        uploadStatus.textContent = 'Processando e carregando dados...';
        uploadStatus.className = 'status-message info';

        // Limpa os dados globais e camadas do mapa antes de carregar novos
        allLotesGeoJSON.features = [];
        allAPPGeoJSON.features = [];
        allPoligonaisGeoJSON.features = [];
        
        // Remove as camadas atuais do mapa e do controle de legenda
        if (lotesLayer) map.removeLayer(lotesLayer);
        if (appLayer) map.removeLayer(appLayer);
        if (poligonaisLayer) map.removeLayer(poligonaisLayer);
        lotesLayer = null;
        appLayer = null;
        poligonaisLayer = null;


        const nucleosSet = new Set(); // Para coletar núcleos únicos dos lotes

        for (const file of selectedFiles) {
            try {
                const reader = new FileReader();
                const fileContent = await new Promise((resolve, reject) => {
                    reader.onload = (e) => resolve(e.target.result);
                    reader.onerror = (e) => reject(e);
                    reader.readAsText(file);
                });
                const geojsonData = JSON.parse(fileContent);

                // Validação básica do GeoJSON
                if (!geojsonData.type || !geojsonData.features) {
                     throw new Error('Arquivo GeoJSON inválido: missing "type" or "features" property.');
                }
                if (geojsonData.type !== 'FeatureCollection') {
                     console.warn(`Arquivo ${file.name} não é um FeatureCollection, pode não ser processado corretamente.`);
                }

                // Lógica simplificada para determinar o tipo de camada pelo nome do arquivo.
                // Você pode estender isso com um campo de seleção para o usuário, se necessário.
                if (file.name.toLowerCase().includes('lotes')) {
                    allLotesGeoJSON.features.push(...geojsonData.features);
                    geojsonData.features.forEach(f => {
                        if (f.properties && f.properties.nucleo) {
                            nucleosSet.add(f.properties.nucleo);
                        }
                    });
                } else if (file.name.toLowerCase().includes('app')) {
                    allAPPGeoJSON.features.push(...geojsonData.features);
                } else { // Presume-se que o restante são poligonais diversas (ex: infraestrutura)
                    allPoligonaisGeoJSON.features.push(...geojsonData.features);
                }

            } catch (error) {
                console.error(`Erro ao carregar ou processar ${file.name}:`, error);
                uploadStatus.textContent = `Erro ao processar ${file.name}. Verifique o formato GeoJSON ou se é válido. Detalhes: ${error.message}`;
                uploadStatus.className = 'status-message error';
                // Limpa os dados carregados parcialmente em caso de erro
                allLotesGeoJSON.features = [];
                allAPPGeoJSON.features = [];
                allPoligonaisGeoJSON.features = [];
                return; // Para de processar outros arquivos se um falhar
            }
        }

        // Carrega as camadas processadas no mapa
        renderLayersOnMap();
        // Atualiza o dashboard com os dados dos lotes (filtrando por núcleo se necessário)
        updateDashboard(allLotesGeoJSON.features);
        // Preenche o filtro de núcleos com os núcleos encontrados
        populateNucleusFilter(Array.from(nucleosSet));
        // Atualiza a tabela detalhada dos lotes
        updateLotesTable(allLotesGeoJSON.features);

        uploadStatus.textContent = 'Dados carregados e processados com sucesso!';
        uploadStatus.className = 'status-message success';
    });
}

// 4. Renderiza as Camadas no Mapa
function renderLayersOnMap(featuresToDisplay = allLotesGeoJSON.features) {
    // Remove camadas existentes do mapa se houver
    if (lotesLayer) map.removeLayer(lotesLayer);
    if (appLayer) map.removeLayer(appLayer);
    if (poligonaisLayer) map.removeLayer(poligonaisLayer);

    // Carrega lotes
    if (featuresToDisplay.length > 0) {
        lotesLayer = L.geoJSON(featuresToDisplay, {
            onEachFeature: onEachFeatureLotes,
            style: styleLotes
        }).addTo(map);
        map.fitBounds(lotesLayer.getBounds());
    } else {
        // Se não houver lotes, centraliza o mapa no Brasil e limpa a camada de lotes
        map.setView([-15.7801, -47.9292], 5);
        document.getElementById('toggleLotes').checked = false; // Desmarca o checkbox
    }

    // Carrega APP (não adiciona ao mapa por padrão, apenas o cria)
    if (allAPPGeoJSON && allAPPGeoJSON.features.length > 0) {
        appLayer = L.geoJSON(allAPPGeoJSON, {
            style: {
                color: '#e74c3c', // Vermelho para APP
                weight: 2,
                opacity: 0.7,
                fillOpacity: 0.2
            },
            onEachFeature: (feature, layer) => {
                 if (feature.properties) {
                    let popupContent = "<h3>Área de Preservação Permanente (APP)</h3>";
                    for (let key in feature.properties) {
                        popupContent += `<strong>${key}:</strong> ${feature.properties[key]}<br>`;
                    }
                    layer.bindPopup(popupContent);
                }
            }
        });
        // Garante que o checkbox do APP esteja desmarcado e a camada invisível
        document.getElementById('toggleAPP').checked = false;
        if (map.hasLayer(appLayer)) map.removeLayer(appLayer); // Apenas para garantir
    }

    // Carrega Poligonais diversas (infraestrutura, etc.)
    if (allPoligonaisGeoJSON && allPoligonaisGeoJSON.features.length > 0) {
        poligonaisLayer = L.geoJSON(allPoligonaisGeoJSON, {
            style: {
                color: '#2ecc71', // Verde para poligonais
                weight: 2,
                opacity: 0.7,
                fillOpacity: 0.2
            },
            onEachFeature: (feature, layer) => {
                 if (feature.properties) {
                    let popupContent = "<h3>Informações da Poligonal</h3>";
                    for (let key in feature.properties) {
                        popupContent += `<strong>${key}:</strong> ${feature.properties[key]}<br>`;
                    }
                    layer.bindPopup(popupContent);
                }
            }
        });
        // Garante que o checkbox de poligonais esteja desmarcado e a camada invisível
        document.getElementById('togglePoligonais').checked = false;
        if (map.hasLayer(poligonaisLayer)) map.removeLayer(poligonaisLayer); // Apenas para garantir
    }
}

// Estilo dos lotes baseado no risco
function styleLotes(feature) {
    const risco = feature.properties.risco || 'N/A'; // Pega o risco ou 'N/A' se não definido
    const style = riscoStyles[risco] || riscoStyles['N/A']; // Pega o estilo correspondente ou o padrão

    return {
        fillColor: style.fillColor,
        weight: 1,
        opacity: 1,
        color: 'white', // Cor da borda
        dashArray: '3', // Borda tracejada
        fillOpacity: 0.7
    };
}

// Popup ao clicar no lote
function onEachFeatureLotes(feature, layer) {
    if (feature.properties) {
        let popupContent = "<h3>Detalhes do Lote:</h3>";
        // Itera sobre todas as propriedades e adiciona ao popup
        for (let key in feature.properties) {
            let value = feature.properties[key];
            if (value === null || value === undefined) value = 'N/A'; // Trata valores nulos/indefinidos

            if (key.toLowerCase().includes('area') && typeof value === 'number') {
                value = value.toLocaleString('pt-BR') + ' m²';
            }
            if (key.toLowerCase().includes('custo') && typeof value === 'number') {
                value = 'R$ ' + value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            }
            if (key.toLowerCase() === 'app' && typeof value === 'boolean') {
                value = value ? 'Sim' : 'Não';
            }

            popupContent += `<strong>${key}:</strong> ${value}<br>`;
        }
        layer.bindPopup(popupContent);
    }
}

// 5. Atualiza o Dashboard
function updateDashboard(features) {
    document.getElementById('totalLotes').innerText = features.length;

    let lotesRiscoCount = 0;
    let lotesAppCount = 0;
    let custoTotal = 0;
    let riskCounts = { 'Baixo': 0, 'Médio': 0, 'Alto': 0, 'Muito Alto': 0 };

    features.forEach(feature => {
        // Assume que 'risco' e 'app' são propriedades do GeoJSON dos lotes
        const risco = feature.properties.risco || 'N/A';
        if (riskCounts.hasOwnProperty(risco)) { // Verifica se a categoria de risco existe
            riskCounts[risco]++;
        }
        
        if (risco !== 'Baixo' && risco !== 'N/A') { // Conta lotes com risco diferente de "Baixo"
            lotesRiscoCount++;
        }
        
        // Para APP: assume que a propriedade 'app' existe e é booleana ou string 'sim'/'nao'
        if (feature.properties.app === true || String(feature.properties.app).toLowerCase() === 'sim') {
            lotesAppCount++;
        }
        // Assume que 'custo_intervencao' é uma propriedade numérica
        custoTotal += (feature.properties.custo_intervencao || 0);
    });

    document.getElementById('lotesRisco').innerText = lotesRiscoCount;
    document.getElementById('lotesApp').innerText = lotesAppCount;
    document.getElementById('custoEstimado').innerText = custoTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    document.getElementById('riskLowCount').innerText = riskCounts['Baixo'] || 0;
    document.getElementById('riskMediumCount').innerText = riskCounts['Médio'] || 0;
    document.getElementById('riskHighCount').innerText = riskCounts['Alto'] || 0;
    document.getElementById('riskVeryHighCount').innerText = riskCounts['Muito Alto'] || 0;

    document.getElementById('areasIdentificadas').innerText = lotesRiscoCount; // Exemplo simplificado
    document.getElementById('areasIntervencao').innerText = lotesRiscoCount; // Exemplo simplificado (todos em risco precisam de intervenção)
}

// 6. Preenche o Filtro de Núcleos
function populateNucleusFilter(nucleos) {
    const filterSelect = document.getElementById('nucleusFilter');
    filterSelect.innerHTML = '<option value="all">Todos os Núcleos</option>';
    if (nucleos.length > 0) {
        nucleos.sort().forEach(nucleo => {
            const option = document.createElement('option');
            option.value = nucleo;
            option.textContent = nucleo;
            filterSelect.appendChild(option);
        });
    }

    // Preenche o filtro de núcleos do relatório também
    const reportNucleosSelect = document.getElementById('nucleosAnalise');
    reportNucleosSelect.innerHTML = '<option value="all">Todos os Núcleos</option>';
    if (nucleos.length > 0) {
        nucleos.sort().forEach(nucleo => {
            const option = document.createElement('option');
            option.value = nucleo;
            option.textContent = nucleo;
            reportNucleosSelect.appendChild(option);
        });
    } else {
        reportNucleosSelect.innerHTML = '<option value="none" disabled selected>Nenhum núcleo disponível. Faça o upload dos dados primeiro.</option>';
    }
}

// 7. Aplica Filtros no Dashboard (e mapa)
document.getElementById('applyFiltersBtn').addEventListener('click', () => {
    const selectedNucleus = document.getElementById('nucleusFilter').value;
    let filteredFeatures = allLotesGeoJSON.features;

    if (selectedNucleus !== 'all') {
        filteredFeatures = allLotesGeoJSON.features.filter(f => f.properties.nucleo === selectedNucleus);
    }

    // Re-renderiza a camada de lotes no mapa com os dados filtrados
    renderLayersOnMap(filteredFeatures);
    
    // Atualiza o dashboard com os dados filtrados
    updateDashboard(filteredFeatures);
    // Atualiza a tabela com dados filtrados
    updateLotesTable(filteredFeatures); 
});

// 8. Tabela de Lotes Detalhados
function updateLotesTable(features) {
    const tableBody = document.querySelector('#lotesDataTable tbody');
    tableBody.innerHTML = ''; // Limpa a tabela

    if (features.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="7">Nenhum dado disponível. Faça o upload das camadas primeiro ou ajuste os filtros.</td></tr>';
        return;
    }

    features.forEach(feature => {
        const row = tableBody.insertRow();
        const props = feature.properties;

        row.insertCell().textContent = props.codigo || 'N/A';
        row.insertCell().textContent = props.nucleo || 'N/A';
        row.insertCell().textContent = props.tipo_uso || 'N/A';
        row.insertCell().textContent = (props.area_m2 && typeof props.area_m2 === 'number') ? props.area_m2.toLocaleString('pt-BR') : 'N/A';
        row.insertCell().textContent = props.risco || 'N/A';
        row.insertCell().textContent = (props.app === true || String(props.app).toLowerCase() === 'sim') ? 'Sim' : 'Não';
        
        const actionsCell = row.insertCell();
        const viewBtn = document.createElement('button');
        viewBtn.textContent = 'Ver no Mapa';
        viewBtn.className = 'small-btn'; // Classe para estilizar o botão pequeno
        viewBtn.onclick = () => {
            // Navega para o dashboard primeiro
            document.querySelector('nav a[data-section="dashboard"]').click();
            
            // Encontra a camada do lote específico e centraliza o mapa
            if (lotesLayer) {
                lotesLayer.eachLayer(layer => {
                    if (layer.feature && layer.feature.properties && layer.feature.properties.codigo === props.codigo) {
                        map.setView(layer.getBounds().getCenter(), 18); // Centraliza e dá zoom
                        layer.openPopup(); // Abre o popup de detalhes
                    }
                });
            }
        };
        actionsCell.appendChild(viewBtn);
    });
}

// Busca na tabela
document.getElementById('lotSearch').addEventListener('keyup', (e) => {
    const searchTerm = e.target.value.toLowerCase();
    const rows = document.querySelectorAll('#lotesDataTable tbody tr');
    rows.forEach(row => {
        const textContent = row.textContent.toLowerCase();
        if (textContent.includes(searchTerm)) {
            row.style.display = '';
        } else {
            row.style.display = 'none';
        }
    });
});

// Exportar Tabela para CSV
document.getElementById('exportTableBtn').addEventListener('click', () => {
    const table = document.getElementById('lotesDataTable');
    let csv = [];
    // Cabeçalho
    const headerRow = [];
    table.querySelectorAll('thead th').forEach(th => {
        if (th.textContent !== 'Ações') { // Exclui a coluna de ações
            headerRow.push(`"${th.textContent.trim()}"`); // Adiciona aspas para lidar com vírgulas no texto
        }
    });
    csv.push(headerRow.join(';')); // Usa ponto e vírgula como separador para CSV pt-BR

    // Linhas de dados
    table.querySelectorAll('tbody tr').forEach(tr => {
        const row = [];
        tr.querySelectorAll('td').forEach((td, index) => {
            // Exclui a última coluna (Ações)
            if (index < tr.querySelectorAll('td').length - 1) {
                // Remove quebras de linha e aspas internas, adiciona aspas para campos com vírgulas
                let text = td.innerText.replace(/"/g, '""').replace(/\n/g, ' ').trim();
                row.push(`"${text}"`);
            }
        });
        csv.push(row.join(';'));
    });

    const csvString = csv.join('\n');
    const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.setAttribute('download', 'dados_lotes_geolaudo.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
});


// 9. Gerador de Relatórios com IA (Simulada)
document.getElementById('generateReportBtn').addEventListener('click', () => {
    const reportType = document.getElementById('reportType').value;
    const nucleosAnalise = document.getElementById('nucleosAnalise').value;
    const incDadosGerais = document.getElementById('incDadosGerais').checked;
    const incAnaliseRiscos = document.getElementById('incAnaliseRiscos').checked;
    const incAreasPublicas = document.getElementById('incAreasPublicas').checked;
    const incInfraestrutura = document.getElementById('incInfraestrutura').checked;
    const generatedReportContent = document.getElementById('generatedReportContent');

    if (!allLotesGeoJSON || allLotesGeoJSON.features.length === 0) {
        generatedReportContent.textContent = "Nenhum dado disponível para gerar o relatório. Faça o upload das camadas primeiro.";
        return;
    }

    let reportText = `RELATÓRIO GEOLAUDO.AI - ${reportType.toUpperCase()}\n`;
    reportText += `Data de Geração: ${new Date().toLocaleDateString('pt-BR')} ${new Date().toLocaleTimeString('pt-BR')}\n\n`;

    let filteredFeatures = allLotesGeoJSON.features;
    if (nucleosAnalise !== 'all' && nucleosAnalise !== 'none') {
        filteredFeatures = allLotesGeoJSON.features.filter(f => f.properties.nucleo === nucleosAnalise);
        reportText += `Análise Focada no Núcleo: ${nucleosAnalise}\n\n`;
    } else {
        reportText += `Análise Abrangente (Todos os Núcleos)\n\n`;
    }

    // Conteúdo do relatório baseado nas opções selecionadas (IA SIMULADA)
    if (incDadosGerais) {
        reportText += `--- 1. Dados Gerais da Área Analisada ---\n`;
        reportText += `Total de Lotes Analisados: ${filteredFeatures.length}\n`;
        
        const totalArea = filteredFeatures.reduce((acc, f) => acc + (f.properties.area_m2 || 0), 0);
        reportText += `Área Total dos Lotes: ${totalArea.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} m²\n\n`;

        const uniqueTiposUso = new Set(filteredFeatures.map(f => f.properties.tipo_uso).filter(Boolean));
        if (uniqueTiposUso.size > 0) {
            reportText += `Principais Tipos de Uso Identificados: ${Array.from(uniqueTiposUso).join(', ')}\n\n`;
        }
    }

    if (incAnaliseRiscos) {
        const riskCounts = { 'Baixo': 0, 'Médio': 0, 'Alto': 0, 'Muito Alto': 0 };
        filteredFeatures.forEach(f => {
            const risco = f.properties.risco || 'N/A';
            if (riskCounts.hasOwnProperty(risco)) riskCounts[risco]++;
        });
        const lotesComRiscoElevado = riskCounts['Médio'] + riskCounts['Alto'] + riskCounts['Muito Alto'];
        const percRiscoElevado = (lotesComRiscoElevado / filteredFeatures.length * 100 || 0).toFixed(2);

        reportText += `--- 2. Análise de Riscos Geológicos e Ambientais ---\n`;
        reportText += `Distribuição de Risco dos Lotes:\n`;
        reportText += `- Baixo Risco: ${riskCounts['Baixo'] || 0} lotes\n`;
        reportText += `- Médio Risco: ${riskCounts['Médio'] || 0} lotes\n`;
        reportText += `- Alto Risco: ${riskCounts['Alto'] || 0} lotes\n`;
        reportText += `- Muito Alto Risco: ${riskCounts['Muito Alto'] || 0} lotes\n\n`;
        reportText += `Total de Lotes com Risco Elevado (Médio, Alto, Muito Alto): ${lotesComRiscoElevado} (${percRiscoElevado}% do total)\n`;
        
        if (lotesComRiscoElevado > 0) {
            reportText += `Recomendação: Áreas com risco médio a muito alto demandam estudos geotécnicos aprofundados e, possivelmente, intervenções estruturais para mitigação de riscos ou realocação, conforme a legislação vigente de REURB e plano de contingência municipal.\n\n`;
        } else {
            reportText += `Recomendação: A área analisada apresenta um perfil de baixo risco predominante, o que facilita o processo de regularização fundiária.\n\n`;
        }
    }

    if (incAreasPublicas) {
        const lotesEmAPP = filteredFeatures.filter(f => f.properties.app === true || String(f.properties.app).toLowerCase() === 'sim').length;
        reportText += `--- 3. Análise de Áreas de Preservação Permanente (APP) ---\n`;
        reportText += `Número de lotes que intersectam ou estão em APP: ${lotesEmAPP}\n`;
        if (lotesEmAPP > 0) {
            reportText += `Observação: A presença de lotes em Áreas de Preservação Permanente exige a aplicação de medidas específicas de regularização ambiental, como a recuperação da área degradada ou a compensação ambiental, conforme o Código Florestal e demais normativas ambientais aplicáveis à REURB.\n\n`;
        } else {
            reportText += `Observação: Não foram identificados lotes em Áreas de Preservação Permanente no conjunto de dados analisado, o que simplifica o licenciamento ambiental da regularização.\n\n`;
        }
    }

    if (incInfraestrutura && allPoligonaisGeoJSON && allPoligonaisGeoJSON.features.length > 0) {
        reportText += `--- 4. Análise de Infraestrutura e Equipamentos Urbanos ---\n`;
        reportText += `Foram detectadas ${allPoligonaisGeoJSON.features.length} poligonais de infraestrutura ou outras áreas de interesse (como vias, áreas verdes, equipamentos comunitários).\n`;
        reportText += `A presença e adequação da infraestrutura existente é um fator chave para a viabilidade e qualidade da regularização. Recomenda-se verificação detalhada da situação da infraestrutura básica (água, esgoto, energia, drenagem, acesso) em relação aos lotes.\n\n`;
    }
    
    // Custo de Intervenção (sempre incluído no final do relatório)
    const custoTotalFiltrado = filteredFeatures.reduce((acc, f) => acc + (f.properties.custo_intervencao || 0), 0);
    reportText += `--- 5. Custo de Intervenção Estimado ---\n`;
    reportText += `Custo Total Estimado para Intervenção nos Lotes Analisados: R$ ${custoTotalFiltrado.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\n`;
    reportText += `Este valor é uma estimativa e deve ser refinado com levantamentos de campo e orçamentos detalhados.\n\n`;


    reportText += `--- Fim do Relatório ---\n`;
    reportText += `Este relatório foi gerado automaticamente pelo GeoLaudo.AI. Para análises mais aprofundadas e validação legal, consulte um especialista qualificado.`;

    generatedReportContent.textContent = reportText;
    generatedReportContent.scrollTop = 0; // Volta para o topo do relatório
});

// Exportar Relatório (botão no header)
document.getElementById('exportReportBtn').addEventListener('click', () => {
    const reportContent = document.getElementById('generatedReportContent').textContent;
    if (reportContent.includes('Nenhum relatório gerado ainda') || reportContent.includes('Nenhum dado disponível')) {
        alert('Por favor, gere um relatório primeiro na aba "Relatórios".');
        return;
    }

    const blob = new Blob([reportContent], { type: 'text/plain;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.setAttribute('download', 'relatorio_geolaudo.txt');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
});