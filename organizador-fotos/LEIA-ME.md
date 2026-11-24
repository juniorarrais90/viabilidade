# Organizador de Fotos e Vídeos — Arrais Advogados

Classifica as fotos e os vídeos da pasta `Banco de Imagens/Entrada` do Google Drive,
move cada arquivo para a pasta certa e separa o que parece descartável.

**Nada é apagado automaticamente.** O que a IA considera descartável vai para a pasta
`Sugestão de apagar`, para você revisar.

## Arquivos

- `Codigo.gs` — o script (Google Apps Script).
- `Painel.html` — a página do painel.

## Instalação (uma vez)

1. Na conta Google pessoal (a da unidade G:), abra <https://script.google.com> e clique em **Novo projeto**.
2. Dê o nome `Organizador de Fotos`.
3. Apague o conteúdo do arquivo `Código.gs` e cole o conteúdo de `Codigo.gs`.
4. Clique em **+** > **HTML**, dê o nome `Painel` (sem `.html`) e cole o conteúdo de `Painel.html`.
5. Na barra lateral, em **Serviços**, clique em **+** e adicione **Drive API**.
6. Em **Configurações do projeto** (engrenagem) > **Propriedades do script**, adicione:
   - Propriedade: `ANTHROPIC_API_KEY`
   - Valor: a sua chave da API do Claude (criada em console.anthropic.com).
7. No editor, escolha a função `configurar` e clique em **Executar**. Autorize o acesso quando o Google pedir.
   Isso cria no Drive a pasta `Banco de Imagens`, com a `Entrada` e todas as subpastas.

## Teste (100 arquivos)

1. Coloque fotos e vídeos em `Banco de Imagens/Entrada`.
2. Execute a função `testar`. Ela processa 100 arquivos e para.
3. Confira as pastas no Drive e a planilha `Organizador de Fotos - Registro`.

## Painel

1. **Implantar** > **Nova implantação** > tipo **App da Web**.
2. Executar como: **Eu**. Quem pode acessar: **Somente eu**.
3. Abra o link gerado. Ele funciona no computador e no celular, logado na mesma conta.

O painel também serve para organizar à mão:

- Clique numa pasta para abrir a galeria (60 arquivos por vez, os mais recentes primeiro).
- Toque nos arquivos para selecionar; **Mover para…** troca de pasta e corrige a planilha.
- **Apagar** envia os selecionados para a lixeira do Google Drive (ficam 30 dias recuperáveis).
  Não há exclusão definitiva pelo painel.

Depois de alterar `Codigo.gs` ou `Painel.html`, publique em **Implantar** > **Gerenciar implantações** >
lápis > **Nova versão**. O link continua o mesmo.

O modelo padrão é `claude-haiku-5-5` (linha `MODELO` do `Codigo.gs`), bem mais barato;
`claude-opus-5-5` classifica melhor e custa muito mais.

## Processar tudo

- `iniciar` liga o processamento automático (um lote a cada 5 minutos).
- `pausar` desliga.
- O Google limita o tempo diário de execução automática; com cerca de 16 mil arquivos,
  o processamento completo leva alguns dias. Ele continua sozinho no dia seguinte.

## Pastas criadas

| Grupo | Pasta | O que vai para lá |
|---|---|---|
| Fotos | Fotos minhas | Retratos e fotos em que você é o assunto principal |
| Fotos | Capas e artes de vídeo | Capas de Reel, thumbnails e artes montadas para post |
| Fotos | Escritório e equipe | Ambiente do escritório, equipe, atendimento |
| Fotos | Eventos e palestras | Eventos profissionais, cursos, audiências |
| Fotos | Família e pessoal | Família, amigos, lazer |
| Fotos | Viagens, rua e paisagem | Paisagens, cidades, viagens |
| Fotos | Comida e objetos | Comida, produtos, objetos, animais |
| Fotos | Prints de tela | Capturas de tela |
| Fotos | Documentos fotografados | Fotos de papéis, contratos, comprovantes |
| Fotos | Memes e imagens recebidas | Memes, artes e imagens de terceiros |
| Vídeos | Conteúdo - gravação bruta | Você falando para a câmera, sem edição |
| Vídeos | Conteúdo - editado (pronto) | Vídeos com legenda e edição, provavelmente já publicados |
| Vídeos | Cenas de apoio | Cenas sem fala, para cobrir trechos do vídeo |
| Vídeos | Pessoal e família | Vídeos de família, amigos, lazer |
| Vídeos | Gravações de tela | Gravações da tela do celular ou do computador |
| Vídeos | Recebidos de terceiros | Vídeos feitos por outras pessoas |
| Triagem | Sugestão de apagar | Borradas, acidentais, memes, prints sem utilidade |
| Triagem | Duplicados | Cópias idênticas de outro arquivo |
| Triagem | Não identificado / Sem miniatura | O que a IA não conseguiu classificar |

Para mudar as pastas ou os critérios, edite a lista `CATEGORIAS` no início de `Codigo.gs`
e execute `configurar` de novo. Para reavaliar o que já foi classificado, ajuste a lista
`RECLASSIFICAR` e execute `reclassificar` até o registro dizer "concluída".

## Limites conhecidos

- A IA vê só uma miniatura (um quadro, no caso de vídeo). Ela não sabe o que já foi
  publicado: marca como "editado (pronto)" o vídeo que tem legenda ou edição visível.
- Duplicados: só cópias idênticas. Fotos parecidas (sequências do mesmo momento) não são detectadas.
- Mover arquivos no Drive não apaga nada do iCloud nem do iPhone.
