# ModelLab 0.11 — Skinning e GLB articulado
```sh
node cli/modellab.js rig personagem.modellab.json --out personagem.rig.json
node cli/modellab.js build personagem.modellab.json --rig personagem.rig.json --out personagem.glb --report skin.json
node cli/modellab.js validate personagem.glb
node cli/modellab.js pose-preview personagem.modellab.json --rig personagem.rig.json --ops pose.json --out pose-revisao
```
Exemplo pose.json: {"leftUpperArm":[0,0,-45],"rightLowerArm":[0,0,30],"leftLowerLeg":[25,0,0]}. Rotações Euler XYZ em graus, relativas ao pai, eixos locais alinhados ao modelo na pose T.
O skinning linear calcula até quatro pesos normalizados por vértice a partir da distância aos segmentos do esqueleto; filtros regionais evitam influência do membro oposto em braços e pernas afastados. UVs e índices não são alterados. A prévia gera uma cópia estática deformada, recalcula normais e renderiza PNG. O GLB inclui joints, pesos, hierarquia e matrizes inversas de bind; reimportação via GLTFLoader verifica a pose de repouso e os pesos. A CLI validate aceita este perfil; importação editável de skins no editor web continua fora do escopo. O rig permanece separado do JSON original. Uma malha selecionada por rig, sem dedos, sem física de tecido, sem correções anatômicas garantidas, sem animações ou retargeting nesta versão. Revise visualmente ombros, cotovelos, joelhos e quadril; estimativa por distância não substitui pesos manuais. API: computeWeights, exportSkinnedGLB, verifySkinnedGLB, poseProject, previewPose em src/skin.js.
