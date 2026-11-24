# ModelLab 0.8 — inspeção visual automatizada
Node 20+, sem WebGL, Blender ou servidor. O renderizador CPU usa a malha, transformações, UV e texturas do editor. Projeção ortográfica, fundo transparente e iluminação simplificada (não é o render PBR da interface).
```sh
node cli/modellab.js render personagem.modellab.json --out revisao --size 512
node cli/modellab.js render personagem.modellab.json --out revisao2 --views front,iso
node cli/modellab.js edit personagem.modellab.json --ops ajustes.json --out personagem-v2.modellab.json
node cli/modellab.js render personagem-v2.modellab.json --out revisao-v2
```
Arquivos: front.png, back.png, left.png, right.png, iso.png e report.json. A escala de enquadramento é independente por vista. A auditoria conta triângulos degenerados, UV ausente, dimensões e vistas fotográficas faltantes. A métrica IoU compara a silhueta frontal com o contorno do projeto apenas para um perfil isolado, sem rotação ou escala. Não é uma comparação de realismo da foto. Não identifica automaticamente anatomia incorreta, interseções ou deformações de rig. A correção usa a CLI edit da 0.7.
A API renderViews em src/render.js devolve RGBA e relatório; cli/png.js converte RGBA para PNG. Testes: npm test.
