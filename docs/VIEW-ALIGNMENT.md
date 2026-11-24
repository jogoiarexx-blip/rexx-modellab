# REXX-TRAIN-08B — Registro de vistas e reprojeção
Complemento ao TRAIN-08 de roupas. O perfil anterior alinhava fotos somente pela altura total. O novo alinhamento ajusta correspondências internas manualmente. Use imagens ortográficas ou com pouca perspectiva, corpo inteiro, mesma pose T e fundo simples. Não há fotos originais pareadas com os modelos 3D para medir precisão da identidade; testes usam silhuetas e imagens sintéticas.

Em alinhamento.json, pares [altura na frente, altura na outra vista], normalizados pela caixa de cada silhueta (0 topo, 1 base). Exemplo:
```json
{"back":[[0.25,0.27],[0.52,0.50]],"side":[[0.25,0.29],[0.52,0.55]]}
```
```sh
node cli/modellab.js photo frente.jpg --back costas.jpg --side perfil.jpg --facing left --alignment alinhamento.json --out personagem.modellab.json
node cli/modellab.js view-audit personagem.modellab.json --report vistas.json
```
Os pontos podem representar ombros, cintura e quadril. O mapeamento monotônico por trechos é usado na profundidade lateral e na projeção das texturas lateral e traseira. Sem pontos, mantém o comportamento anterior. view-audit compara largura normalizada e número de intervalos em oito alturas, alerta sobre vistas ausentes e divergências; não certifica qualidade.

Em refine --ops, use {"anatomyStyle":"athletic","face":{"strength":0.65},"reproject":true} para reprojetar a foto lateral sobre a geometria refinada, sem reaproveitar o cache anterior. Sem perfil lateral não há reprojeção adicional. Não resolve perspectiva, oclusões, segmentação de cabelo ou roupas, nem produz fotogrametria real. Interface web não recompilada nesta rodada. Nenhum asset original publicado.
