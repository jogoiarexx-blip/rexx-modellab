# Automação REXX ModelLab 0.7
API JavaScript local, sem servidor, sem IA paga e sem Blender. O formato de projeto continua 1.0 e o editor web não muda. Node.js 20+.

## CLI
```sh
node cli/modellab.js new --name "Meu projeto" --out projeto.modellab.json
node cli/modellab.js photo agente.jpg --height 1.83 --depth 0.25 --out agente.modellab.json
node cli/modellab.js inspect agente.modellab.json --report inspeção.json
node cli/modellab.js edit agente.modellab.json --ops ajustes.json --out agente-v2.modellab.json
node cli/modellab.js build agente-v2.modellab.json --out agente.glb --report validacao.json
```
A entrada da CLI foto é JPEG de até 2048 pixels por lado. Fundo uniforme facilita a detecção de silhueta. Se a detecção falhar, informe --contour pontos.json (array de pares x,y em pixels). A fotografia frontal não reconstrói automaticamente costas e laterais reais. Não há rig ou animação nesta versão.

## Operações JSON
```json
[
  {"type":"adjustProfile","id":"character","height":1.83,"depth":0.27,"keepFloor":true,"fields":{"detail":0.3}},
  {"type":"updateMaterial","id":"photo","fields":{"roughness":0.75}},
  {"type":"rename","name":"Agente V2"}
]
```
Tipos: rename, addMaterial, updateMaterial, addPart, updatePart, removePart (inclui descendentes), addReference, adjustProfile. As alterações são aplicadas em cópia, validadas a cada passo, e gravadas somente se concluídas. Posição e tamanho em metros, rotação em graus. Para superfícies não horizontais, keepFloor apenas corrige Y local; não calcula colisões ou piso mundial.

## API
Importe createProject, photoProject, applyOperations, inspectProject de src/automation.js; exportGLB e verifyGLB de src/format.js. photoProject aceita imagem JPEG data URI, contorno opcional, altura, profundidade, volume e detalhe. inspectProject informa dimensões, triângulos, peças e alertas de vistas faltantes. Para testes: npm test.

## Próximos passos
0.8: renderizar frente, costas, perfis e perspectiva automaticamente; 0.9: reconstrução multivista; 0.10: rig; 0.11: skinning; 0.12: animações; 0.13: UV; 0.14: MCP local/remoto autenticado. GitHub Pages permanece estático. O acesso a um servidor MCP pelo ChatGPT exige configuração compatível separada.
