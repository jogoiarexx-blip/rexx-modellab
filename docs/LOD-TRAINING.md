# REXX-TRAIN-09 — LOD e orçamento de exportação
Integra os módulos de textura e simplificação já disponíveis. O corpus anterior mostra 826 a 2.581.135 triângulos e mapas de até 8K. Esses números fundamentam as metas, não são resultados de compressão dos arquivos originais.
 
| Nível | Proporção alvo | Triângulos máximos alvo | Textura | Arquivo alvo |
|---|---:|---:|---:|---:|
| LOD0 | 100% | 300.000 | 2048 | 24 MiB |
| LOD1 | 60% | 30.000 | 1024 | 16 MiB |
| LOD2 | 30% | 12.000 | 512 | 8 MiB |
 
```sh
node cli/modellab.js lod personagem.modellab.json --rig personagem.rig.json --animations idle,walk,run --out export/character
```
Opcional: --motion corrida.clip.json, --ops lod.json contendo {"maxBytes":8388608}.
Exporta lod0.glb, lod1.glb, lod2.glb e manifest.json. Cada variante é construída do mesmo projeto de origem e preserva o rig fornecido e os clipes selecionados, com pesos recalculados. O relatório mede bytes, triângulos, vértices, ossos, mapas e clipes; estima memória RGBA sem compressão GPU, com e sem mipmaps, e tamanho de atributos/index. O motor consumidor deve selecionar um nível por distância, não carregar os três ao mesmo tempo. Não há extensão MSFT_lod.
 
A simplificação é conservadora; o LOD0 apenas limpa a malha, e os outros níveis podem parar antes da meta. Cada arquivo continua sujeito ao limite rígido existente de 24 MiB; exportação que excede esse limite falha. Metas não atingidas abaixo do limite ficam explícitas no manifesto. Não comprime Draco/KTX2, não preserva skin de GLB importado, não retopologiza malhas acima do limite de importação, não garante redução em todas as malhas. Testes sintéticos; validação visual/animada dos arquivos reais ainda necessária. CLI disponível, interface web não recompilada. Nenhum asset original publicado.
