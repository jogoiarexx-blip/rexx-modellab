# REXX-TRAIN-11 — Biblioteca de criaturas
Modelos paramétricos editáveis de cachorro (dog), lobo (wolf), cavalo (horse), monstro quadrúpede (beast) e dragão (dragon). Gera torso, cabeça, focinho, olhos, quatro patas, cauda e detalhes específicos; dragão tem membranas de asa com espessura e suportes. Tubos indexados fechados com UV. Peças podem se sobrepor; não há fusão, anatomia realista ou rig não humanoide nesta etapa.
```json
{"species":"dragon","name":"Dragão verde","height":1.8,"quality":"mobile","color":"#55715c","proportions":{"tail":1.2,"wings":1.1}}
```
Salve como receita.json.
```sh
node cli/modellab.js creature receita.json --out criatura.modellab.json --report criatura-report.json
node cli/modellab.js render criatura.modellab.json --out revisao
node cli/modellab.js build criatura.modellab.json --out criatura.glb
```
A altura controla a cernelha nominal (não a altura total). Proporções length,width,legs,neck,head,tail,wings aceitam .6–1.5. Mobile usa 8 lados nos tubos e balanced 14; as esferas seguem a resolução padrão do motor. Materiais PBR sólidos editáveis. A API createCreature permite reference:{image:JPEG data URI,facing:"left" ou "right",landmarks:{withers:[x,y],rump:[x,y],muzzle:[x,y],groundY:y}}. Marcações manuais de cernelha, garupa e focinho e chão estimam comprimento do torso e posição da cabeça. Foto deve mostrar lateral perpendicular e chão; largura e outras medidas são presumidas pelo preset. A foto fica armazenada como guia, não é projetada como textura. MCP create_creature aceita JPEG local e marcações nos campos próprios. Receita CLI aceita a referência embutida. Exportação atual é GLB estático; não aplique autoRig humanoide a estes modelos. GameForge não foi alterado.
