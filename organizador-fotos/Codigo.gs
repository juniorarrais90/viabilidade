/**
 * Organizador de Fotos e Vídeos — Arrais Advogados
 *
 * Lê a pasta "Entrada" do Drive, olha a miniatura de cada arquivo, pede a
 * classificação à IA e move o arquivo para a pasta certa. Nada é apagado:
 * o que parece descartável vai para a pasta "Sugestão de apagar", para revisão.
 *
 * Uso (menu de funções do editor do Apps Script):
 *   1. configurar()  -> cria as pastas e a planilha de registro
 *   2. testar()      -> processa só 100 arquivos, para conferir o resultado
 *   3. iniciar()     -> liga o processamento automático (a cada 5 minutos)
 *   4. pausar()      -> desliga o processamento automático
 *
 * A chave da API do Claude NÃO fica neste arquivo. Ela é guardada em
 * Configurações do projeto > Propriedades do script, com o nome ANTHROPIC_API_KEY.
 */

var CONFIG = {
  PASTA_RAIZ: 'Banco de Imagens',
  PASTA_ENTRADA: 'Entrada',
  PLANILHA: 'Organizador de Fotos - Registro',
  MODELO: 'claude-haiku-5-5',     // 'claude-opus-5-5' classifica melhor, mas custa muito mais
  ARQUIVOS_POR_PEDIDO: 8,         // miniaturas enviadas à IA em cada pedido
  TEMPO_MAX_MS: 4.5 * 60 * 1000,  // cada execução para antes do limite de 6 min do Google
  LIMITE_TESTE: 100,
  LARGURA_MINIATURA: 512
};

// Pastas de destino. "tipo" restringe a categoria a fotos, a vídeos ou a ambos.
var CATEGORIAS = [
  { chave: 'foto_minha',      tipo: 'foto',  pasta: 'Fotos/Fotos minhas',
    regra: 'retrato ou foto em que o dono do acervo (advogado, homem, cerca de 36 anos, costuma usar terno) é o assunto principal' },
  { chave: 'foto_escritorio', tipo: 'foto',  pasta: 'Fotos/Escritório e equipe',
    regra: 'ambiente de escritório de advocacia, equipe de trabalho, atendimento, fachada, mesa de trabalho' },
  { chave: 'foto_evento',     tipo: 'foto',  pasta: 'Fotos/Eventos e palestras',
    regra: 'evento profissional, palestra, curso, audiência, congresso, premiação' },
  { chave: 'foto_familia',    tipo: 'foto',  pasta: 'Fotos/Família e pessoal',
    regra: 'família, amigos, crianças, festas, lazer, vida pessoal' },
  { chave: 'foto_viagem',     tipo: 'foto',  pasta: 'Fotos/Viagens, rua e paisagem',
    regra: 'paisagem, cidade, rua, viagem, natureza, prédios, sem foco em pessoas conhecidas' },
  { chave: 'foto_objeto',     tipo: 'foto',  pasta: 'Fotos/Comida e objetos',
    regra: 'comida, bebida, produto, objeto, carro, animal de estimação' },
  { chave: 'print',           tipo: 'foto',  pasta: 'Fotos/Prints de tela',
    regra: 'captura de tela de celular ou computador (conversa, aplicativo, site, rede social)' },
  { chave: 'documento',       tipo: 'foto',  pasta: 'Fotos/Documentos fotografados',
    regra: 'foto de documento, papel, contrato, boleto, comprovante, receita, quadro com texto' },
  { chave: 'imagem_recebida', tipo: 'foto',  pasta: 'Fotos/Memes e imagens recebidas',
    regra: 'meme, figurinha, arte pronta, banner, imagem de corrente, material claramente recebido de terceiros' },

  { chave: 'video_bruto',     tipo: 'video', pasta: 'Vídeos/Conteúdo - gravação bruta',
    regra: 'pessoa falando para a câmera, enquadramento de gravação de conteúdo, SEM legenda nem efeitos de edição' },
  { chave: 'video_editado',   tipo: 'video', pasta: 'Vídeos/Conteúdo - editado (pronto)',
    regra: 'vídeo já editado: com legenda embutida, título, logotipo, cortes ou efeitos; provavelmente já publicado' },
  { chave: 'video_apoio',     tipo: 'video', pasta: 'Vídeos/Cenas de apoio',
    regra: 'cena sem fala para a câmera, útil como imagem de apoio: escritório, rua, mãos, objetos, ambiente' },
  { chave: 'video_pessoal',   tipo: 'video', pasta: 'Vídeos/Pessoal e família',
    regra: 'vídeo de família, amigos, festa, lazer, viagem' },
  { chave: 'video_tela',      tipo: 'video', pasta: 'Vídeos/Gravações de tela',
    regra: 'gravação da tela do celular ou do computador' },
  { chave: 'video_recebido',  tipo: 'video', pasta: 'Vídeos/Recebidos de terceiros',
    regra: 'vídeo claramente feito por terceiros: meme, corrente, propaganda, vídeo baixado de rede social' },

  { chave: 'nao_identificado', tipo: 'ambos', pasta: 'Não identificado',
    regra: 'usar somente quando a miniatura não permite decidir' }
];

var PASTA_DUPLICADOS = 'Duplicados';
var PASTA_APAGAR = 'Sugestão de apagar';
var PASTA_SEM_MINIATURA = 'Sem miniatura';
var DESTINO_LIXEIRA = 'Lixeira do Drive';   // marca na planilha o que foi apagado pelo painel

var COLUNAS = ['Data', 'Nome', 'ID', 'Tipo', 'Categoria', 'Limpeza', 'Motivo', 'Descrição',
               'Destino', 'Tamanho (MB)', 'Caminho original', 'MD5'];

/* ------------------------------------------------------------------ */
/* Funções que você executa pelo editor                                */
/* ------------------------------------------------------------------ */

function configurar() {
  var props = PropertiesService.getScriptProperties();
  var raiz = pastaPorNome_(DriveApp.getRootFolder(), CONFIG.PASTA_RAIZ);
  var entrada = pastaPorNome_(raiz, CONFIG.PASTA_ENTRADA);
  var mapa = {};
  CATEGORIAS.forEach(function (c) { mapa[c.chave] = pastaPorCaminho_(raiz, c.pasta).getId(); });
  mapa._duplicados = pastaPorNome_(raiz, PASTA_DUPLICADOS).getId();
  mapa._apagar = pastaPorNome_(raiz, PASTA_APAGAR).getId();
  mapa._sem_miniatura = pastaPorNome_(raiz, PASTA_SEM_MINIATURA).getId();

  var idPlanilha = props.getProperty('PLANILHA_ID');
  if (!idPlanilha) {
    var ss = SpreadsheetApp.create(CONFIG.PLANILHA);
    ss.getSheets()[0].setName('Registro').appendRow(COLUNAS).setFrozenRows(1);
    DriveApp.getFileById(ss.getId()).moveTo(raiz);
    idPlanilha = ss.getId();
  }
  props.setProperties({
    ENTRADA_ID: entrada.getId(),
    PASTAS: JSON.stringify(mapa),
    PLANILHA_ID: idPlanilha
  });
  Logger.log('Pastas e planilha prontas em "' + CONFIG.PASTA_RAIZ + '".');
  if (!props.getProperty('ANTHROPIC_API_KEY')) {
    Logger.log('ATENÇÃO: falta cadastrar a chave ANTHROPIC_API_KEY em Configurações do projeto > Propriedades do script.');
  }
}

/** Processa no máximo 100 arquivos e para. Serve para conferir a qualidade e medir o custo. */
function testar() {
  PropertiesService.getScriptProperties().setProperty('LIMITE', String(totalProcessado_() + CONFIG.LIMITE_TESTE));
  processarLote();
}

/** Liga o processamento automático de toda a pasta Entrada. */
function iniciar() {
  pausar();
  PropertiesService.getScriptProperties().deleteProperty('LIMITE');
  ScriptApp.newTrigger('processarLote').timeBased().everyMinutes(5).create();
  Logger.log('Processamento automático ligado.');
}

function pausar() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'processarLote') ScriptApp.deleteTrigger(t);
  });
}

/* ------------------------------------------------------------------ */
/* Processamento                                                       */
/* ------------------------------------------------------------------ */

function processarLote() {
  var trava = LockService.getScriptLock();
  if (!trava.tryLock(1000)) return;  // já existe uma execução em andamento
  try {
    var inicio = Date.now();
    var props = PropertiesService.getScriptProperties();
    var chave = props.getProperty('ANTHROPIC_API_KEY');
    if (!chave || !props.getProperty('ENTRADA_ID')) {
      throw new Error('Execute configurar() e cadastre ANTHROPIC_API_KEY antes de processar.');
    }
    var pastas = JSON.parse(props.getProperty('PASTAS'));
    var aba = SpreadsheetApp.openById(props.getProperty('PLANILHA_ID')).getSheetByName('Registro');
    var md5Vistos = carregarMd5_(aba);
    var limite = Number(props.getProperty('LIMITE') || 0);
    var feitos = aba.getLastRow() - 1;
    var ignorar = {};

    while (Date.now() - inicio < CONFIG.TEMPO_MAX_MS) {
      if (limite && feitos >= limite) { Logger.log('Limite do teste atingido.'); break; }
      var quantos = CONFIG.ARQUIVOS_POR_PEDIDO;
      if (limite) quantos = Math.min(quantos, limite - feitos);
      var arquivos = proximosArquivos_(props.getProperty('ENTRADA_ID'), quantos, ignorar);
      if (!arquivos.length) { Logger.log('Pasta Entrada sem arquivos pendentes.'); break; }

      var linhas = [];
      var paraIA = [];
      try {
      arquivos.forEach(function (a) {
        if (a.md5 && md5Vistos[a.md5]) {
          mover_(a.id, pastas._duplicados);
          linhas.push(linha_(a, 'duplicado', 'apagar', 'Cópia idêntica de outro arquivo', '', PASTA_DUPLICADOS));
        } else {
          if (a.md5) md5Vistos[a.md5] = true;
          paraIA.push(a);
        }
      });

      var miniaturas = baixarMiniaturas_(paraIA);
      var comImagem = [];
      paraIA.forEach(function (a, i) {
        if (miniaturas[i]) { a.imagem = miniaturas[i]; comImagem.push(a); return; }
        // Vídeo recém-enviado pode ainda não ter miniatura: tenta de novo em outra execução.
        if (Date.now() - new Date(a.criado).getTime() < 24 * 3600 * 1000) { ignorar[a.id] = true; return; }
        mover_(a.id, pastas._sem_miniatura);
        linhas.push(linha_(a, 'sem_miniatura', 'revisar', 'O Drive não gerou miniatura', '', PASTA_SEM_MINIATURA));
      });

      if (comImagem.length) {
        var respostas = classificar_(comImagem, chave);
        comImagem.forEach(function (a, i) {
          var r = validar_(respostas[i], a);
          var cat = categoria_(r.categoria);
          var apagar = r.limpeza === 'apagar';
          mover_(a.id, apagar ? pastas._apagar : pastas[cat.chave]);
          linhas.push(linha_(a, cat.chave, r.limpeza, r.motivo, r.descricao, apagar ? PASTA_APAGAR : cat.pasta));
        });
      }

      } finally {
        // Grava o que já foi movido, mesmo se a IA falhar no meio do lote.
        if (linhas.length) {
          aba.getRange(aba.getLastRow() + 1, 1, linhas.length, COLUNAS.length).setValues(linhas);
          feitos += linhas.length;
        }
      }
    }
  } finally {
    trava.releaseLock();
  }
}

/** Percorre a Entrada (e subpastas) e devolve os próximos arquivos pendentes. */
function proximosArquivos_(entradaId, quantos, ignorar) {
  var resultado = [];
  var pilha = [{ id: entradaId, caminho: '' }];
  var campos = 'nextPageToken,files(id,name,mimeType,md5Checksum,thumbnailLink,size,createdTime,videoMediaMetadata(durationMillis))';
  while (pilha.length && resultado.length < quantos) {
    var pasta = pilha.pop();
    var token = '';
    do {
      var url = 'https://www.googleapis.com/drive/v3/files?pageSize=200&fields=' + encodeURIComponent(campos) +
                '&q=' + encodeURIComponent("'" + pasta.id + "' in parents and trashed = false") +
                (token ? '&pageToken=' + token : '');
      var dados = JSON.parse(UrlFetchApp.fetch(url, { headers: autorizacao_() }).getContentText());
      (dados.files || []).forEach(function (f) {
        if (f.mimeType === 'application/vnd.google-apps.folder') {
          pilha.push({ id: f.id, caminho: pasta.caminho + f.name + '/' });
        } else if (!ignorar[f.id] && resultado.length < quantos) {
          var video = f.mimeType.indexOf('video/') === 0;
          var foto = f.mimeType.indexOf('image/') === 0;
          if (!video && !foto) { ignorar[f.id] = true; return; }  // outros tipos ficam na Entrada
          resultado.push({
            id: f.id, nome: f.name, tipo: video ? 'video' : 'foto', md5: f.md5Checksum || '',
            miniatura: f.thumbnailLink || '', tamanho: Number(f.size || 0), criado: f.createdTime,
            duracao: f.videoMediaMetadata ? Math.round(Number(f.videoMediaMetadata.durationMillis || 0) / 1000) : 0,
            caminho: pasta.caminho + f.name
          });
        }
      });
      token = dados.nextPageToken || '';
    } while (token && resultado.length < quantos);
  }
  return resultado;
}

/** Baixa as miniaturas em paralelo. Devolve base64 (JPEG/PNG) ou null para cada arquivo. */
function baixarMiniaturas_(arquivos) {
  if (!arquivos.length) return [];
  var pedidos = arquivos.map(function (a) {
    var url = a.miniatura
      ? a.miniatura.replace(/=s\d+$/, '=s' + CONFIG.LARGURA_MINIATURA)
      : 'https://drive.google.com/thumbnail?id=' + a.id + '&sz=w' + CONFIG.LARGURA_MINIATURA;
    return { url: url, headers: autorizacao_(), muteHttpExceptions: true };
  });
  return UrlFetchApp.fetchAll(pedidos).map(function (resp) {
    if (resp.getResponseCode() !== 200) return null;
    var blob = resp.getBlob();
    var tipo = blob.getContentType() || '';
    if (tipo.indexOf('image/') !== 0) return null;
    return { tipo: tipo.split(';')[0], dados: Utilities.base64Encode(blob.getBytes()) };
  });
}

/** Envia as miniaturas à IA e devolve uma lista de respostas na mesma ordem. */
function classificar_(arquivos, chave) {
  var conteudo = [];
  arquivos.forEach(function (a, i) {
    conteudo.push({ type: 'text', text: 'Arquivo ' + (i + 1) + ' — ' + (a.tipo === 'video'
      ? 'VÍDEO de ' + a.duracao + ' s (a imagem é um quadro do vídeo)' : 'FOTO') + ' — nome: ' + a.nome });
    conteudo.push({ type: 'image', source: { type: 'base64', media_type: a.imagem.tipo, data: a.imagem.dados } });
  });
  conteudo.push({ type: 'text', text: instrucoes_(arquivos.length) });

  var corpo = {
    model: CONFIG.MODELO,
    max_tokens: 8000,
    output_config: { effort: 'low' },
    messages: [{ role: 'user', content: conteudo }]
  };
  var resp = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
    method: 'post',
    contentType: 'application/json',
    headers: { 'x-api-key': chave, 'anthropic-version': '2023-06-01' },
    payload: JSON.stringify(corpo),
    muteHttpExceptions: true
  });
  var codigo = resp.getResponseCode();
  if (codigo !== 200) {
    // 429 e 5xx são passageiros: a próxima execução tenta de novo. Os demais exigem correção.
    throw new Error('API do Claude respondeu ' + codigo + ': ' + resp.getContentText().slice(0, 300));
  }
  var dados = JSON.parse(resp.getContentText());
  somarUso_(dados.usage);
  if (dados.stop_reason === 'refusal' || dados.stop_reason === 'max_tokens') return [];
  var texto = (dados.content || []).filter(function (b) { return b.type === 'text'; })
    .map(function (b) { return b.text; }).join('');
  var ini = texto.indexOf('['), fim = texto.lastIndexOf(']');
  if (ini < 0 || fim < ini) return [];
  var lista;
  try { lista = JSON.parse(texto.slice(ini, fim + 1)); } catch (e) { return []; }
  var porNumero = [];
  lista.forEach(function (item) { if (item && item.arquivo) porNumero[item.arquivo - 1] = item; });
  return porNumero;
}

function instrucoes_(n) {
  var fotos = CATEGORIAS.filter(function (c) { return c.tipo !== 'video'; });
  var videos = CATEGORIAS.filter(function (c) { return c.tipo !== 'foto'; });
  var lista = function (cs) { return cs.map(function (c) { return '- ' + c.chave + ': ' + c.regra; }).join('\n'); };
  return [
    'Você organiza o acervo de fotos e vídeos do celular de um advogado que produz conteúdo jurídico para redes sociais.',
    'Classifique cada um dos ' + n + ' arquivos acima em exatamente uma categoria.',
    '',
    'Categorias para FOTO:', lista(fotos),
    '',
    'Categorias para VÍDEO:', lista(videos),
    '',
    'Para cada arquivo, indique também o campo "limpeza":',
    '- "apagar": claramente descartável (foto borrada, tremida, escura ou acidental; print sem utilidade aparente; meme ou corrente; imagem quase vazia).',
    '- "revisar": talvez descartável (vídeo editado que provavelmente já foi publicado; print; documento antigo; vídeo recebido de terceiros).',
    '- "manter": todo o resto. Na dúvida entre apagar e revisar, use "revisar". Nunca sugira apagar foto de família ou documento legível.',
    '',
    'Responda SOMENTE com um array JSON, um objeto por arquivo, neste formato:',
    '[{"arquivo": 1, "categoria": "chave_da_categoria", "limpeza": "manter", "motivo": "até 10 palavras", "descricao": "até 12 palavras sobre o que aparece"}]'
  ].join('\n');
}

/* ------------------------------------------------------------------ */
/* Painel (web app)                                                    */
/* ------------------------------------------------------------------ */

function doGet() {
  return HtmlService.createHtmlOutputFromFile('Painel')
    .setTitle('Organizador de Fotos — Arrais')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/** Dados que o painel exibe. Chamado pela página a cada poucos segundos. */
function obterPainel() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty('PLANILHA_ID');
  if (!id) return { configurado: false };
  var aba = SpreadsheetApp.openById(id).getSheetByName('Registro');
  var ultima = aba.getLastRow();
  var linhas = ultima > 1 ? aba.getRange(2, 1, ultima - 1, COLUNAS.length).getValues() : [];
  var grupos = {};
  var ordem = [];
  var registrar = function (nome, grupo, tipo) { grupos[nome] = { nome: nome, grupo: grupo, tipo: tipo || 'ambos', total: 0, ids: [] }; ordem.push(nome); };
  CATEGORIAS.forEach(function (c) { registrar(c.pasta, c.pasta.indexOf('/') > 0 ? c.pasta.split('/')[0] : 'Triagem', c.tipo); });
  [PASTA_APAGAR, PASTA_DUPLICADOS, PASTA_SEM_MINIATURA].forEach(function (p) { registrar(p, 'Triagem'); });

  var t = { arquivos: 0, fotos: 0, videos: 0, duplicados: 0, apagar: 0, revisar: 0, mbApagar: 0, lixeira: 0 };
  linhas.forEach(function (l) {
    if (l[8] === DESTINO_LIXEIRA) { t.lixeira++; return; }
    t.arquivos++;
    if (l[3] === 'video') t.videos++; else t.fotos++;
    if (l[8] === PASTA_DUPLICADOS) t.duplicados++;
    if (l[5] === 'apagar') { t.apagar++; t.mbApagar += Number(l[9]) || 0; }
    if (l[5] === 'revisar') t.revisar++;
    var g = grupos[l[8]];
    if (g) { g.total++; g.ids.push(l[2]); }
  });
  var cartoes = ordem.map(function (nome) {
    var g = grupos[nome];
    return { nome: nome.replace(/^.*\//, ''), destino: nome, tipo: g.tipo, grupo: g.grupo, total: g.total, ids: g.ids.slice(-12) };
  });
  return {
    configurado: true,
    totais: t,
    cartoes: cartoes,
    ativo: ScriptApp.getProjectTriggers().some(function (g) { return g.getHandlerFunction() === 'processarLote'; }),
    tokensEntrada: Number(props.getProperty('TOKENS_ENTRADA') || 0),
    tokensSaida: Number(props.getProperty('TOKENS_SAIDA') || 0),
    modelo: CONFIG.MODELO
  };
}

/**
 * Miniaturas para o painel, em data URI. Guarda em cache por 6 horas.
 * largura: 96 (cartões da tela inicial) ou 240 (galeria de uma pasta).
 */
function obterMiniaturas(ids, largura) {
  largura = Number(largura) === 240 ? 240 : 96;
  var prefixo = (largura === 240 ? 'g_' : 'm_');
  ids = (ids || []).slice(0, 40);
  var cache = CacheService.getScriptCache();
  var achados = cache.getAll(ids.map(function (id) { return prefixo + id; }));
  var saida = {};
  var faltam = [];
  ids.forEach(function (id) { if (achados[prefixo + id]) saida[id] = achados[prefixo + id]; else faltam.push(id); });
  if (faltam.length) {
    var respostas = UrlFetchApp.fetchAll(faltam.map(function (id) {
      return { url: 'https://drive.google.com/thumbnail?id=' + id + '&sz=w' + largura, headers: autorizacao_(), muteHttpExceptions: true };
    }));
    var novos = {};
    respostas.forEach(function (resp, i) {
      if (resp.getResponseCode() !== 200) return;
      var blob = resp.getBlob();
      var tipo = (blob.getContentType() || '').split(';')[0];
      if (tipo.indexOf('image/') !== 0) return;
      var uri = 'data:' + tipo + ';base64,' + Utilities.base64Encode(blob.getBytes());
      saida[faltam[i]] = uri;
      if (uri.length < 90000) novos[prefixo + faltam[i]] = uri;
    });
    cache.putAll(novos, 21600);
  }
  return saida;
}

/* ------------------------------------------------------------------ */
/* Painel: abrir uma pasta, mover e apagar                             */
/* ------------------------------------------------------------------ */

/** Arquivos de uma pasta de destino, os mais recentes primeiro, de 60 em 60. */
function listarPasta(destino, inicio) {
  var aba = abaRegistro_();
  var ultima = aba.getLastRow();
  var linhas = ultima > 1 ? aba.getRange(2, 1, ultima - 1, COLUNAS.length).getValues() : [];
  var achados = [];
  for (var i = linhas.length - 1; i >= 0; i--) {
    var l = linhas[i];
    if (l[8] === destino) {
      achados.push({ id: String(l[2]), nome: String(l[1]), tipo: String(l[3]), limpeza: String(l[5]),
                     motivo: String(l[6]), descricao: String(l[7]), mb: Number(l[9]) || 0 });
    }
  }
  inicio = Number(inicio) || 0;
  return { destino: destino, inicio: inicio, total: achados.length, itens: achados.slice(inicio, inicio + 60) };
}

/** Move os arquivos escolhidos no painel para outra pasta e corrige a planilha. */
function moverArquivos(ids, destino) {
  var pastas = JSON.parse(PropertiesService.getScriptProperties().getProperty('PASTAS'));
  var cat = CATEGORIAS.filter(function (c) { return c.pasta === destino; })[0];
  var idPasta = cat ? pastas[cat.chave]
    : destino === PASTA_APAGAR ? pastas._apagar
    : destino === PASTA_DUPLICADOS ? pastas._duplicados
    : destino === PASTA_SEM_MINIATURA ? pastas._sem_miniatura : null;
  if (!idPasta) throw new Error('Pasta desconhecida: ' + destino);
  var pasta = DriveApp.getFolderById(idPasta);
  return atualizarLinhas_(ids, function (id, linha) {
    DriveApp.getFileById(id).moveTo(pasta);
    if (cat) linha[4] = cat.chave;
    linha[5] = destino === PASTA_APAGAR ? 'apagar' : 'manter';
    linha[6] = 'Movido manualmente pelo painel';
    linha[8] = destino;
  });
}

/**
 * Envia os arquivos escolhidos para a lixeira do Google Drive.
 * Não é exclusão definitiva: o Drive guarda a lixeira por 30 dias.
 */
function apagarArquivos(ids) {
  return atualizarLinhas_(ids, function (id, linha) {
    DriveApp.getFileById(id).setTrashed(true);
    linha[5] = 'apagado';
    linha[6] = 'Enviado para a lixeira pelo painel';
    linha[8] = DESTINO_LIXEIRA;
  });
}

/** Aplica uma ação a cada arquivo e regrava a linha dele na planilha. */
function atualizarLinhas_(ids, acao) {
  ids = (ids || []).slice(0, 200);
  var aba = abaRegistro_();
  var ultima = aba.getLastRow();
  var coluna = ultima > 1 ? aba.getRange(2, 3, ultima - 1, 1).getValues() : [];
  var linhaDe = {};
  coluna.forEach(function (l, i) { linhaDe[l[0]] = i + 2; });
  var feitos = [];
  var falhas = 0;
  ids.forEach(function (id) {
    var n = linhaDe[id];
    if (!n) { falhas++; return; }
    try {
      var faixa = aba.getRange(n, 1, 1, COLUNAS.length);
      var linha = faixa.getValues()[0];
      acao(id, linha);
      faixa.setValues([linha]);
      feitos.push(id);
    } catch (e) {
      falhas++;
    }
  });
  return { feitos: feitos, falhas: falhas };
}

function abaRegistro_() {
  var id = PropertiesService.getScriptProperties().getProperty('PLANILHA_ID');
  if (!id) throw new Error('Execute configurar() primeiro.');
  return SpreadsheetApp.openById(id).getSheetByName('Registro');
}

/* ------------------------------------------------------------------ */
/* Auxiliares                                                          */
/* ------------------------------------------------------------------ */

function validar_(r, arquivo) {
  var padrao = { categoria: 'nao_identificado', limpeza: 'revisar', motivo: 'A IA não respondeu para este arquivo', descricao: '' };
  if (!r || typeof r !== 'object') return padrao;
  var cat = CATEGORIAS.filter(function (c) { return c.chave === r.categoria; })[0];
  if (!cat || (cat.tipo !== 'ambos' && cat.tipo !== arquivo.tipo)) {
    return { categoria: 'nao_identificado', limpeza: 'revisar', motivo: 'Categoria inválida para ' + arquivo.tipo, descricao: String(r.descricao || '') };
  }
  var limpeza = ['manter', 'revisar', 'apagar'].indexOf(r.limpeza) >= 0 ? r.limpeza : 'revisar';
  return { categoria: cat.chave, limpeza: limpeza, motivo: String(r.motivo || ''), descricao: String(r.descricao || '') };
}

function categoria_(chave) {
  return CATEGORIAS.filter(function (c) { return c.chave === chave; })[0];
}

function linha_(a, categoria, limpeza, motivo, descricao, destino) {
  return [new Date(), a.nome, a.id, a.tipo, categoria, limpeza, motivo, descricao, destino,
          Math.round(a.tamanho / 1048576 * 10) / 10, a.caminho, a.md5];
}

function mover_(idArquivo, idPasta) {
  DriveApp.getFileById(idArquivo).moveTo(DriveApp.getFolderById(idPasta));
}

function carregarMd5_(aba) {
  var vistos = {};
  var ultima = aba.getLastRow();
  if (ultima < 2) return vistos;
  aba.getRange(2, COLUNAS.length, ultima - 1, 1).getValues().forEach(function (l) { if (l[0]) vistos[l[0]] = true; });
  return vistos;
}

function totalProcessado_() {
  var id = PropertiesService.getScriptProperties().getProperty('PLANILHA_ID');
  if (!id) throw new Error('Execute configurar() primeiro.');
  return SpreadsheetApp.openById(id).getSheetByName('Registro').getLastRow() - 1;
}

function somarUso_(uso) {
  if (!uso) return;
  var props = PropertiesService.getScriptProperties();
  props.setProperty('TOKENS_ENTRADA', String(Number(props.getProperty('TOKENS_ENTRADA') || 0) + (uso.input_tokens || 0)));
  props.setProperty('TOKENS_SAIDA', String(Number(props.getProperty('TOKENS_SAIDA') || 0) + (uso.output_tokens || 0)));
}

function autorizacao_() {
  return { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() };
}

function pastaPorNome_(pai, nome) {
  var it = pai.getFoldersByName(nome);
  return it.hasNext() ? it.next() : pai.createFolder(nome);
}

function pastaPorCaminho_(raiz, caminho) {
  return caminho.split('/').reduce(function (pai, nome) { return pastaPorNome_(pai, nome); }, raiz);
}
