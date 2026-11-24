# REXX ModelLab 0.14 — MCP local
Servidor stdio (JSON-RPC 2.0, lifecycle initialize/initialized da revisão MCP 2025-11-25; negocia também revisões anteriores indicadas no código). Implementação mínima de tools/list e tools/call, não um servidor HTTP nem OAuth. Node.js 20+, sem dependências adicionais. Clientes com suporte a MCP stdio podem iniciar o processo. Clientes exclusivamente remotos/HTTP precisam de adaptação separada; não há conexão automática ao ChatGPT web.
## Configuração
Clone o repositório e crie uma pasta exclusiva para entrada e saída. Copie fotos JPEG e projetos para ela. Não use pasta pessoal ou compartilhada com processos não confiáveis.
Exemplo Codex (TOML, ajuste caminhos absolutos):
```toml
[mcp_servers.modellab]
command = "node"
args = ["C:/rexx-modellab/mcp/server.js", "--workspace", "C:/ModelLabWorkspace"]
```
Exemplo configuração JSON de cliente desktop que suporta mcpServers:
```json
{"mcpServers":{"modellab":{"command":"node","args":["C:/rexx-modellab/mcp/server.js","--workspace","C:/ModelLabWorkspace"]}}}
```
Em ambos pode adicionar "--read-only" para disponibilizar somente ferramentas que não escrevem arquivos. Reinicie o cliente e confira ferramentas disponíveis. Não há confirmação automática pelo servidor: configure aprovações no cliente. O processo herda permissões da conta que o inicia.
## Ferramentas
list_files, create_project, photo_character, edit_project, inspect_project, render_project, refine_character, audit_uv, edit_textures, auto_rig, edit_rig, preview_rig, preview_pose, list_animations, preview_animation, export_glb, validate_glb. tools/list fornece schemas de argumentos. Prévias retornam blocos MCP image PNG, até 512px por vista; o cliente deve suportar imagens de ferramentas para inspeção visual. Artefatos são arquivos locais com nomes simples. Fotos são copiadas manualmente ao workspace, não recebidas por URL.
## Segurança e limites
Sem shell, rede, execução arbitrária, exclusão ou sobrescrita. Validação de nomes, sem subpastas; symlinks e hardlinks de entrada recusados; arquivos regulares até 24 MiB; solicitações até 4 MiB; operações serializadas; gravação exclusiva. Requer filesystem local com hardlinks suportados. Não é sandbox do SO: mantenha workspace sob controle exclusivo do usuário, sem escritores concorrentes não confiáveis. Não exponha diretamente na internet. O modo somente leitura bloqueia gravações de artefatos. A reconstrução segue limitações das versões anteriores.
## Testes
npm test verifica handshake, schemas, prévias PNG, exportação de personagem animado, bloqueio de caminhos e modo somente leitura. Compatibilidade com clientes externos deve ser verificada separadamente.
