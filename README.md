# REXX ModelLab 0.6

Editor 3D em português para criar objetos rígidos e exportá-los como GLB. O navegador e a CLI utilizam o mesmo projeto JSON e o mesmo motor de geometria. A caixa de suprimentos, a baliza de sinalização e a célula de energia vêm prontas para editar.

## Abrir no Windows

1. Extraia toda a pasta do ZIP.
2. Abra **index.html** no Chrome ou Edge, com aceleração gráfica e WebGL 2 disponíveis. O editor também pode ser servido por um servidor estático. A versão avulsa **REXX_ModelLab.html** contém as mesmas funções em um único arquivo.
3. Arraste para girar a câmera. Use a roda para aproximar e o botão direito para deslocar. Clique em uma peça na imagem ou na hierarquia.
4. Use **Salvar projeto** para guardar o arquivo editável e **Exportar GLB** para gerar o modelo destinado ao jogo. O rascunho do navegador é uma conveniência. Guarde o JSON para retomar o trabalho em outro computador.

O editor funciona offline. Os scripts, o motor 3D e as miniaturas acompanham a distribuição. A CLI requer Node.js 20 ou superior. Não é necessário instalar dependências para abrir o editor, executar os comandos da CLI ou rodar os testes.

## Criar a partir de uma foto
1. Abra **Foto para 3D**. A placa de direção renderizada serve de exemplo com contorno e escala já marcados. Para trabalhar com sua imagem, use **Carregar imagem** e escolha um JPEG, PNG ou WebP de até 12 MiB.
2. Ao carregar a imagem, o editor tenta sugerir o contorno pelo contraste com o fundo. Para traçar manualmente, use **Limpar** e clique ao redor da borda externa, em sequência. O programa fecha o perfil a partir do terceiro ponto. Arraste as marcações para ajustar. Shift + clique insere um ponto na aresta mais próxima. Use **Desfazer marcação** ou **Excluir ponto** para corrigir.
3. Informe a largura em metros ou escolha **Por uma medida na imagem**. Nesse modo, marque dois extremos visíveis e informe a distância real entre eles. A altura é calculada pela proporção do contorno.
4. Em **Detectar pelo contorno**, uma figura de frente com braços abertos e pernas separadas ativa o modo de personagem. Ajuste o volume do personagem ou selecione o modo de objeto para definir uma profundidade uniforme. Compare a silhueta nas vistas Frente, Lado e Costas. Use **Salvar três vistas em PNG** para guardar a comparação em escala comum. Escolha o destino e clique em **Criar peça 3D**.
5. No modo personagem, use **Adicionar foto das costas** para carregar uma segunda imagem na mesma pose e com o corpo inteiro. Alterne entre **Frente** e **Costas** na área da imagem para corrigir cada contorno. A prévia e o GLB passam a usar ambas as fotos.
6. Use **Adicionar foto de perfil** para ajustar a profundidade. Escolha uma foto lateral de corpo inteiro na mesma pose, confira o contorno e indique a direção do rosto. O app usa o contorno lateral para posicionar e dimensionar a espessura de cada altura do corpo. A foto de perfil colore o lado fotografado, com transições para a frente e as costas. Em **Relevo da foto**, ajuste a intensidade do relevo frontal calculado pelo contraste local. O resultado é uma aproximação da superfície, sensível à iluminação da foto. Use valores baixos se houver sombras fortes na referência.
7. Para voltar à foto depois, selecione a peça no inspetor e clique em **Editar contorno e profundidade**. Salve o projeto em JSON para guardar uma cópia redimensionada da imagem, os pontos e a escala.

Cada perfil tem uma borda externa de 3 a 192 pontos. Em **Personagem em pose de T**, a largura do tronco orienta a espessura máxima. O volume varia na cabeça, no tronco e nos membros. A textura da frente vem da foto. Com apenas a frente, as cores das costas são estimadas pelas bordas da roupa e da pele. Com duas fotos, o contorno traseiro orienta a projeção da segunda imagem. O contorno frontal define a altura e a largura. A profundidade usa o perfil lateral quando disponível e as proporções do contorno frontal nos demais casos. A foto frontal gera uma malha estática, sem esqueleto. Um fundo simples e contrastante facilita a marcação automática.

O exemplo de objeto está em **examples/placa.modellab.json** e **examples/placa.glb**. Projetos anteriores continuam abrindo. Para converter um contorno de personagem existente, abra **Editar contorno e profundidade**, confira a detecção e aplique a alteração. O JSON conserva as referências e os pontos de cada vista. O GLB conserva a malha e incorpora a textura do personagem.

## Primeiro modelo

Abra **Fechos frontais** na árvore e selecione **Fecho esquerdo**. No inspetor, ajuste **Posição X** para **-0,422 m** (ou **-0.422**, conforme a configuração numérica do navegador). Para colorir apenas a peça principal da tampa, selecione **Tampa superior**, use **Tornar exclusivo desta peça** e escolha a cor. Para mudar todas as peças que compartilham um acabamento, edite o material compartilhado. Desfazer recupera o estado anterior.

Em **Validar modelo**, o programa gera o GLB em memória, reabre o arquivo e compara a hierarquia, as transformações, os materiais, a contagem de triângulos e as dimensões. O relatório pode ser salvo em JSON. O modelo que acompanha o pacote está em **examples/caixa.glb**.

## Ferramentas

| Ação | Controle |
| --- | --- |
| Selecionar, mover, girar ou escalar | Q, W, E, R ou barra flutuante |
| Editar valores, dimensões e cor | Inspetor à direita |
| Adicionar primitivas ou grupos | Botão + em Hierarquia ou aba Biblioteca |
| Duplicar / excluir peça e descendentes | Ctrl+D / Delete |
| Desfazer / refazer | Ctrl+Z / Ctrl+Y ou botões do cabeçalho |
| Enquadrar peça / cena | F / Home |
| Ativar grade / aramado | G / Z |
| Alternar perspectiva, frente, lado e topo | Menu de câmera acima da cena |
| Criar, abrir ou renomear projeto | Arquivo |
| Abrir JSON ou GLB / salvar o JSON | Ctrl+O / Ctrl+S |
| Trocar a peça pai preservando a posição no mundo | Inspetor → Hierarquia |

## Construir pela linha de comando

Abra o terminal na pasta que contém **index.html**. Os caminhos abaixo funcionam no PowerShell, macOS e Linux.

~~~sh
node cli/modellab.js init --template caixa --out minha-caixa.modellab.json
node cli/modellab.js build minha-caixa.modellab.json --out saida/caixa.glb --report saida/validacao.json
node cli/modellab.js validate saida/caixa.glb
node cli/modellab.js import saida/caixa.glb --out saida/reimportada.modellab.json
~~~

Para reconstruir uma edição feita no navegador, passe ao comando **build** o JSON baixado em **Salvar projeto**. O mesmo comando aceita qualquer nome de arquivo JSON que siga o esquema. As opções de **--template** são **caixa**, **baliza**, **celula** e **placa**. **build --dry-run** gera e valida em memória. **--help** mostra a sintaxe. Uma execução bem-sucedida retorna código 0 e relatório JSON. Erros retornam código 1 com a causa. Arquivos de saída existentes com o nome solicitado são substituídos.

## Escrever uma receita

O contrato está em **schema/project.schema.json**. As regras de referências entre peças e materiais, ciclos e integridade de malhas são verificadas pelo núcleo em **src/model.js**. A versão inicial lê o formato implementado nos exemplos. O JSON de humanoide no GDD descreve um formato futuro.

~~~json
{
  "schemaVersion": "1.0",
  "name": "Meu primeiro cubo",
  "units": "meters",
  "materials": [
    {"id":"oliva","name":"Oliva","color":"#849258","roughness":0.6,"metalness":0.15}
  ],
  "parts": [
    {
      "id":"bloco","name":"Bloco","parent":null,"shape":"box","material":"oliva",
      "position":[0,0.25,0],"rotation":[0,0,0],"scale":[1,1,1],"size":[1,0.5,0.7]
    }
  ]
}
~~~

No formato de perfil, **references** armazena as imagens JPEG incorporadas e suas dimensões em pixels. A peça usa **shape** igual a **profile**. **profile.reference** aponta para o ID da imagem. **profile.points** traz as coordenadas XY em pixels com origem no canto superior esquerdo. **profile.calibration** é opcional e define os extremos **a**, **b** e a distância **meters**. **size** contém largura, altura e profundidade em metros.

Cada peça tem um **id** estável. **parent** recebe o identificador de outra peça ou **null** para a raiz. O eixo Y aponta para cima. A posição usa metros e a rotação usa graus em ordem XYZ, relativas ao pai. **size** define as dimensões da geometria das primitivas. **scale** também afeta os filhos. O valor **size** de uma malha importada é um multiplicador XYZ aplicado aos seus vértices. O editor salva o estado final das peças, dos grupos e dos materiais. O histórico de desfazer dura a sessão.

## Compatibilidade da versão 0.6

A importação aceita **GLB 2.0** com uma cena, buffer incorporado, malhas trianguladas e materiais PBR opacos com cor, rugosidade e metalicidade. Normais e o primeiro conjunto de UV são preservados quando presentes. Cores editáveis são representadas por RGB de oito bits por canal. Peças importadas tornam-se malhas editáveis por transformação e material. A origem procedural fica preservada no JSON do ModelLab. Há limite de 24 MiB por entrada e 1.500 peças por projeto.

A importação e reexportação preservam as texturas JPEG de cor emitidas pelo editor (UV0, filtro linear e bordas limitadas). Outros mapas de material, rigs, animações, transparência, extensões de compressão e múltiplas cenas ficam fora deste perfil. Rigging e animação de personagens são etapas futuras do GDD.

## Publicar e desenvolver

Para GitHub Pages, coloque **index.html** e a pasta **assets/** no mesmo nível da raiz de publicação. Também é possível publicar o HTML avulso como **index.html**. O programa usa caminhos relativos e roda no cliente.

~~~sh
npm test
npm start
~~~

O servidor local atende em **http://127.0.0.1:4173**. Para modificar os fontes e recompilar os pacotes de distribuição, execute os comandos abaixo. A instalação de ferramentas de desenvolvimento requer acesso ao npm.

~~~sh
npm install
npm run build
node scripts/standalone.mjs
~~~

**src/** contém o editor, o viewport e o núcleo compartilhado. **vendor/** contém o motor compilado para uso offline. **scripts/examples.mjs** regenera as três receitas originais. **tests/** cobre reconstrução, reimportação, entradas inválidas, primitivas e CLI. As licenças do Three.js, do codec jpeg-js e dos ícones Lucide estão em **licenses/**.

## Automação 0.7

Crie personagens por JPEG, ajuste projetos com operações JSON e inspecione a malha pela CLI ou API JavaScript. Veja [documentação de automação](docs/AUTOMATION.md).

## Inspeção visual 0.8

Renderização CPU em cinco vistas PNG e auditoria de malha: [documentação](docs/RENDER.md).

## Reconstrução multivista 0.9

Fotografias frontal, traseira e lateral pela CLI, profundidade calibrada e refinamento regional: [documentação](docs/MULTIVIEW.md).
