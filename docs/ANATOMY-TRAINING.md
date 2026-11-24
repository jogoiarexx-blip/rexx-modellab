# REXX-TRAIN-03 — Volume anatômico regional
Reanálise local de quatro GLBs: posições únicas, eixo Y com altura 1,7 m, faixa de +/- 0,04 da altura por linha medida a partir do topo; quantis 5% e 95% de Z, divididos pela altura. Acima da linha .55, filtro central de X de +/- .16 da altura em torno da mediana. Não foi aplicada pose ou animação. Menos de 10 posições na banda são insuficientes. Os valores são descritores de superfície (incluem roupa e acessórios), não medidas anatômicas individuais.
 
| Linha | Corsair | Denim | Harbinger | Rustbound |
|---|---:|---:|---:|---:|
| .09 | .137 | .139 | .322 | — |
| .18 | .130 | .198 | .437 | — |
| .28 | .203 | .197 | .462 | — |
| .40 | .122 | .205 | .436 | — |
| .51 | .111 | .214 | .220 | .100 |
| .65 | .105 | .203 | .353 | — |
| .78 | .084 | .225 | .415 | .018 |
| .91 | .065 | .201 | .310 | — |
 
Corsair foi escolhido como prior limitado e opcional, sem inferir gênero ou composição corporal. A enorme diferença dos outros modelos justifica não calcular uma média universal. O refinador aplica um envelope suavizado de profundidade, regiões distintas de peito/cintura/quadril, face, braços, coxas e panturrilhas; a foto lateral reduz a força do prior. Preserva posições XY, UV, índices e costuras. Estilos neutral, athletic e soft são escolhas procedurais, não classificações dos modelos.
 
Crie fatores.json:
```json
{"anatomyStyle":"athletic","anatomyStrength":0.75,"torso":1,"arms":1}
```
```sh
node cli/modellab.js refine personagem.modellab.json --id character --ops fatores.json --out refinado.modellab.json
node cli/modellab.js rig refinado.modellab.json --id character --hands detailed --out personagem.rig.json
```
Sem anatomyStyle, mantém o comportamento anterior. strength=0 desativa o efeito. O refinamento converte um perfil em mesh, portanto deve ser feito antes do rig; preserve o projeto original. Não cria dedos separados, olhos, boca ou músculos individualmente esculpidos, nem reconstrói uma face 3D verdadeira. Não houve mudança na interface web nem validação visual com fotografias originais. Os modelos originais não são publicados.
