# REXX-TRAIN-10 — Produção integrada de personagens
O fluxo reúne os módulos anteriores sem substituir o editor. Primeiro crie um perfil de foto com o comando photo (frente, costas e lateral opcionais). Use a receita original, não um mesh já refinado.
```sh
node cli/modellab.js photo frente.jpg --back costas.jpg --side perfil.jpg --facing left --out original.modellab.json
node cli/modellab.js character original.modellab.json --out personagem-export --ops receita.json
```
Receita opcional:
```json
{"refine":{"anatomyStyle":"athletic","face":{"strength":0.65}},"clothing":{"style":"field"},"hands":"detailed","handMesh":{"segments":8},"animations":["idle","walk","run","jump","attack","hit","death"],"levels":["lod0","lod1","lod2"]}
```
Para importar movimento, acrescente --motion Running.fbx (FBX binário 7400 compatível). Use retarget na receita para fps, yaw, name, loop. Por padrão, gera 66 ossos, mãos detalhadas e sete clipes procedurais, sem mudar o vestuário da foto. hands basic desativa a geometria adicional de dedos por padrão. O rig usa a silhueta original para preservar landmarks XY; revise os ajustes joints antes da exportação. O pacote inclui projeto editável refinado, rig, pose de preensão opcional, clips.json, GLBs LOD independentes e manifesto medido. O diretório CLI precisa ser novo; manifesto é escrito por último. Erros não são convertidos em sucesso.

No MCP local, ferramenta build_character aceita project, prefix, options e motion (arquivo FBX no workspace, limite 24 MiB). O servidor não sobrescreve arquivos. Instalação/conexão do MCP é responsabilidade do operador; não existe integração automática com ChatGPT ou Claude. CLI aceita FBX até 128 MiB. O comando não envia fotos para serviços externos. 

Limites: não cria personagem de texto sem foto ou perfil, não é treinamento neural, não promete semelhança facial, topologia soldada das mãos, IK ou fidelidade visual de retarget. O orçamento é medido, não garantido. O pacote conserva limitações dos módulos anteriores. Testes usam imagens sintéticas; não são validação visual de personagens reais. Interface web não recompilada nesta etapa.
