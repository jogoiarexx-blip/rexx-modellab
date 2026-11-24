# ModelLab 0.9 — reconstrução multivista e volumes regionais
Use fotos JPEG frontais e traseiras em pose T e uma foto lateral ortogonal, todas da mesma pessoa e enquadradas por inteiro. Contornos podem ser automáticos ou fornecidos como arrays JSON de pares x,y.
```sh
node cli/modellab.js photo frente.jpg --back costas.jpg --side lateral.jpg --facing left --height 1.83 --detail .3 --out personagem.modellab.json
node cli/modellab.js refine personagem.modellab.json --id character --ops fatores.json --out refinado.modellab.json
node cli/modellab.js render refinado.modellab.json --out revisao
node cli/modellab.js build refinado.modellab.json --out personagem.glb
```
Fatores regionais opcionais, entre 0.65 e 1.4, padrão 1:
```json
{"head":1.08,"torso":1.0,"arms":0.95,"legs":1.02,"feet":1.1}
```
A lateral calibra a profundidade pela proporção da silhueta (override --depth); --volume ajusta a profundidade sugerida. --detail ajusta relevo fotográfico existente. --back-contour e --side-contour permitem contorno manual. --facing left ou right descreve a direção do rosto na foto lateral.
O refinamento cria uma cópia mesh com a textura e UV preservados, mantendo o projeto fotográfico original. Não cria dedos, não recupera anatomia oculta, não é fotogrametria nem reconstrução por IA; a definição depende da resolução das fotos e da geometria já disponível. O comando refine não altera a interface web.
