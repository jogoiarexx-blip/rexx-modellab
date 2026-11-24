# ModelLab 0.13 — Texturas e UV
Ferramentas de CLI e API, sem dependências novas. O editor original e schema 1.0 são preservados.
```sh
node cli/modellab.js uv-audit personagem.modellab.json --report uv.json
node cli/modellab.js texture personagem.modellab.json --preset mobile --out leve.modellab.json --report textura.json
node cli/modellab.js texture personagem.modellab.json --ops ajustes.json --out editado.modellab.json
node cli/modellab.js material-maps textura.jpg --size 512 --out mapas
node cli/modellab.js build leve.modellab.json --rig personagem.rig.json --animations all --out personagem.glb
```
Perfis de textura: mobile 512px/JPEG78, balanced 1024px/JPEG86, cinematic 2048px/JPEG94. Limites são do maior lado; não amplia a fonte. Redução usa média de área. Para personagens fotográficos a textura gerada é consolidada em uma malha editável, sem mudar posições, índices e UV (salvo ajuste explícito ou atlas). Preserve a receita fotográfica original. O relatório mede bytes JPEG únicos das peças processadas, não promete redução total do GLB. O atlas opcional (até 16 peças) usa margens de 8 pixels, remapeia UVs e mantém materiais PBR separados. Pode reduzir resolução ou aumentar bytes; compare antes/depois.
Exemplo ajustes.json:
```json
{"preset":"balanced","parts":["character"],"adjustments":{"character":{"image":{"brightness":3,"contrast":1.05,"sharpen":0.2,"patches":[{"rect":[0.1,0.1,0.15,0.15],"fill":"#303030"}]},"uv":{"scale":[1,1],"offset":[0,0]}}}}
```
Ajuste UV por escala, deslocamento e espelhamento; preenchimento por retângulos UV normalizados (origem superior esquerda). Não realiza unwrap automático nem reconstrução de detalhes inexistentes. A auditoria detecta coordenadas fora de 0–1, triângulos UV degenerados e razão de densidade; não detecta sobreposição. Materiais procedurais: fabric, metal, stone, checker, com base/accent/seed/size. Exemplo: {"adjustments":{"character":{"procedural":{"pattern":"fabric","base":"#333333","accent":"#666666"}}}}. Normal e roughness/ORM são PNGs auxiliares estimados a partir da luminância; não são capturas reais de relevo, e ainda não são incorporados no GLB do perfil rígido/skin. Use no material Three.js ou em pipeline externo. O editor gráfico de UV fica para evolução futura.
API: auditUV, editTextures, editImage, proceduralTexture, materialMaps em src/texture.js.
