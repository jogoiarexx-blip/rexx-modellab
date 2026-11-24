# REXX-TRAIN-05 — Geometria de mãos e pose de preensão
Referência reaberta: FBX Tactical Shadow (Mixamo Running). Foram medidos os comprimentos das translações locais dos nós 2–4 de cada cadeia (unidades do arquivo, sem conversão). Soma esquerda/direita: polegar .038049/.040019; indicador .042076/.046716; médio .042756/.042756; anelar .042756/.042756; mínimo .028621/.033781. São comprimentos das cadeias, não diâmetros. A escala relativa orienta heuristicamente a espessura dos dedos gerados. As posições seguem o rig detalhado já existente, sem transferir a pose animada do FBX.
 
## Fluxo
```sh
node cli/modellab.js refine personagem.modellab.json --id character --out refinado.modellab.json
node cli/modellab.js rig refinado.modellab.json --id character --hands detailed --out personagem.rig.json
node cli/modellab.js hands-mesh refinado.modellab.json --rig personagem.rig.json --out maos.modellab.json --report maos-report.json
node cli/modellab.js grip personagem.rig.json --strength 0.8 --out pose.json
node cli/modellab.js pose-preview maos.modellab.json --rig personagem.rig.json --ops pose.json --out revisao
node cli/modellab.js build maos.modellab.json --rig personagem.rig.json --animations all --out personagem.glb
```
 
Opções de hands-mesh via --ops: {"segments":10,"thickness":1}. O comando comprime a geometria original distal numa palma e acrescenta duas palmas e dez dedos tubulares fechados e afunilados; cada dedo acompanha os quatro pontos do esqueleto. O UV adicional aproxima as cores da mão por amostragem dos UVs existentes. A pose grip fornece rotações procedurais simétricas para os 30 segmentos móveis. Mantenha o rig original, pois recalcular o rig após alterar a geometria deslocaria os ossos.
 
Limites: mãos em pose T, palmas para baixo, sem armas ou objetos na silhueta. Componentes fechados mas sobrepostos, não soldados, podendo apresentar interseções, artefatos de textura e deformações; requer revisão visual. Não há unhas, articulações esculpidas, colisão com objetos, IK ou transferência de animação Mixamo. A pose é uma aproximação e não foi validada visualmente em modelos reais. Não modifica a interface web nem publica os arquivos enviados. Testes cobrem contagem, topologia dos tubos, pose e exportação.
