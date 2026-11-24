# REXX-TRAIN-02 — Rig de mãos e isolamento dos pesos
Referência: Tactical Shadow, FBX Running do lote de 24/11/2026. Inspeção binária confirmou 66 LimbNodes, incluindo Left/RightHandThumb, Index, Middle, Ring e Pinky, cada um com índices 1–4, e um clipe Running. Outros GLBs usam nomes genéricos Bone_000 etc.; não inferimos identidade anatômica pelos nomes genéricos.
 
O modo básico de 26 ossos permanece padrão. O modo detailed acrescenta 40 ossos (cinco cadeias de quatro por mão) com proporções procedurais, não cópia dos vértices originais. O skinning mantém quatro influências, restringe dedos à região da mão e seleciona o dedo mais próximo usando distância tridimensional. Os nomes semânticos têm alias Mixamo para os dedos; isso não implementa retarget de animação ou correção de bind pose.
 
```sh
node cli/modellab.js rig personagem.modellab.json --id character --hands detailed --out personagem.rig.json
node cli/modellab.js rig-preview personagem.modellab.json --rig personagem.rig.json --out revisao
node cli/modellab.js build personagem.modellab.json --rig personagem.rig.json --animations all --out personagem.glb
```
Limites: pose T com palmas para baixo, profundidade dos dedos estimada. Se a malha não contém dedos separados, o esqueleto não os cria. Ajuste manual das articulações e inspeção de deformações são necessários, especialmente para luvas, punhos fechados e armas. Não houve treino neural, publicação de modelos originais, nem alteração da interface web. Os testes novos cobrem hierarquia, aliases, isolamento dos pesos e exportação/reimportação GLB.
