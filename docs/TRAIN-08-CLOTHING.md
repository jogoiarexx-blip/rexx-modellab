# REXX-TRAIN-08 — Vestuário procedural
Detalhes de roupa em relevo local sobre a geometria humanoide existente: lapelas, costuras, bolsos, cintos, punhos, dobras e placas. Três estilos suit (terno), field (uniforme de campo), armor (armadura leve). Intensidade limitada pela espessura local; preserva a silhueta frontal, costura, UVs e índices. Opcionalmente aplica tonalidade e sombreamento à textura original. Não cria peças independentes, não simula tecido, não detecta roupa na foto, não substitui modelagem de acessórios.
```sh
node cli/modellab.js clothing personagem.modellab.json --out vestido.modellab.json --ops roupa.json --report roupa-report.json
node cli/modellab.js render vestido.modellab.json --out revisao
node cli/modellab.js build vestido.modellab.json --rig personagem.rig.json --animations idle,walk --out vestido.glb
```
Exemplo roupa.json:
```json
{"style":"suit","strength":0.7,"tint":"#303040","tintStrength":0.3,"features":{"lapels":1.2,"folds":0.6},"refine":{"anatomyStyle":"neutral","anatomyStrength":0.5}}
```
API trainClothing(source,id,options) em src/clothing-training.js e ferramenta MCP train_clothing. Entrada exige receita original humanoide em T; a função chama refineCharacter, então opções anatômicas/faciais podem ser passadas em refine. Saída é uma cópia consolidada em mesh. Gere rig da receita original, revise antes de exportar. Para dedos detalhados, a geometria de mãos pode ser adicionada posteriormente. Intensidade 0 preserva a geometria refinada e a textura. A aparência real depende da fotografia e densidade da malha; não garante relevo físico correto. A etapa não altera o GameForge.
