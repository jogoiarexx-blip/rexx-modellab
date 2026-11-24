# REXX-TRAIN-04 — Relevo facial ajustável
Reabertos os quatro GLBs originais: posições únicas em coordenadas locais, Y normalizado pela altura total de 1,7; selecionados os 15% superiores e X dentro de +/- 12% da altura em relação à mediana. Extensões robustas (P95–P5)/altura:
 
| Referência | Amostras | X | Y | Z |
|---|---:|---:|---:|---:|
| Crimson Corsair | 880 | .097 | .120 | .135 |
| Denim Confidence | 26484 | .136 | .133 | .142 |
| Harbinger of Decay | 422 | .211 | .129 | .325 |
| Rustbound Threshold | 11 | — | — | — |
 
A seleção inclui cabelos e acessórios; não identifica olhos, nariz ou boca. As referências humanas motivaram um limite conservador de deslocamento; a criatura não define o prior humano. Não houve foto original pareada nem landmarks anotados, portanto as formas são procedurais e ajustáveis, não reconstrução fiel da identidade.
 
## Uso
Em fatores.json:
```json
{"face":{"strength":0.75,"features":{"nose":1.15,"eyes":0.9,"lips":0.8},"rows":{"nose":0.60}}}
```
```sh
node cli/modellab.js refine personagem.modellab.json --id character --ops fatores.json --out refinado.modellab.json
node cli/modellab.js render refinado.modellab.json --out revisao --size 768
```
Opcional: face.box = [x0,y0,x1,y1], normalizados em relação à caixa da silhueta inteira, origem no canto superior esquerdo. Use para corrigir detecção estimada do contorno da cabeça. face.rows ajusta as alturas normalizadas dentro dessa caixa; face.features permite ajustar testa, sobrancelhas, órbitas/pálpebras, nariz, maçãs do rosto, lábios e queixo. Sem face ou com strength=0, o comportamento anterior é preservado.
 
A malha recebe subdivisão conforme concentrada na caixa facial, com UV interpolado pela mesma projeção; o relevo modifica Z frontal e desaparece nas costuras, limitado pela espessura local. Com foto lateral, a intensidade é reduzida. O projeto original fica intacto; refine antes de gerar rig. Não adiciona olhos esféricos, cavidade bucal, orelhas separadas, dentes, expressões ou landmarks por IA. Texturas existentes são reaproveitadas; a projeção lateral não é refeita sobre a malha refinada. Ainda requer revisão visual e eventual retopologia. Interface web não alterada. Não publica assets originais.
