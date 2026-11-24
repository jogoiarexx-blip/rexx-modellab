# REXX-TRAIN-01 — Referências de personagens
Nove referências analisadas em 24/11/2026: quatro GLBs e cinco FBXs. O corpus guarda apenas métricas agregadas e IDs anônimos, sem arquivos originais. Os quatro GLBs têm pesos normalizados (erro máximo inferior a 2e-7); todos têm até quatro influências por vértice. Os três FBXs de corrida têm AnimationStack Running e nomes mixamorig, um com 66 ossos incluindo dedos. Os FBXs estáticos têm 715.150 e 2.581.135 triângulos. GLBs com cerca de 10 mil triângulos tinham texturas de até 8K; tamanho de geometria e tamanho de textura devem ser tratados separadamente. As proporções globais não foram usadas como anatomia universal, pois pose, roupa e acessórios alteram os limites.
 
## CLI
```sh
node cli/modellab.js reference referencia.glb --preset mobile --report referencia.json
node cli/modellab.js photo frente.jpg --preset mobile --out personagem.modellab.json
node cli/modellab.js build personagem.modellab.json --preset mobile --out personagem.glb
```
A análise aceita GLB até 128 MiB sem importá-lo para edição; o limite existente de 24 MiB para produção/importação continua intacto. A auditoria conta triângulos, ossos, clipes, bytes de textura, dimensões PNG/JPEG e distribuição dos pesos; não avalia anatomia, aparência ou deformações. Imagens externas ou formatos não suportados são reportados como desconhecidos. O orçamento é um alvo, não uma garantia: no comando photo o preset define o relevo/subdivisão já suportado (detail); build reporta excessos sem redimensionar texturas nem simplificar automaticamente a malha. --detail explícito prevalece. Sem preset, a produção anterior permanece igual.
 
## Próximos passos
Retopologia adaptativa com preservação de UV/skin; normal maps e materiais PBR; rig de dedos e retarget Mixamo com validação de pose de repouso e eixos; reconstrução comparada com foto original e vistas laterais. Não foi treinada rede neural. O suporte FBX desta rodada é análise offline do corpus; o comando reference lê GLB, não FBX.
