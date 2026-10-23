"""Carimba uma versão (?v=...) em todas as importações de JS e CSS do site.

O GitHub Pages manda o navegador guardar cada arquivo por 10 minutos (e alguns
navegadores guardam mais). Sem o carimbo, quem já visitou o site recebe uma mistura
de arquivos velhos e novos. Com ele, cada publicação gera endereços novos.

Uso (antes de cada publicação):  python ferramentas/versionar.py
Todas as importações recebem a MESMA versão; isso é importante, porque o mesmo
módulo importado com endereços diferentes viraria duas cópias (dois áudios, dois
progressos...).
"""
import datetime
import pathlib
import re

RAIZ = pathlib.Path(__file__).resolve().parent.parent
versao = datetime.datetime.now().strftime('%Y%m%d%H%M')

padroes = [
    # import ... from './x.js'   e   export ... from './x.js'
    (re.compile(r"(from\s+'(?:\.{1,2}/)[^'?]+?\.js)(?:\?v=[^']*)?'"), r"\1?v=" + versao + "'"),
    # import('./x.js')
    (re.compile(r"(import\(\s*'(?:\.{1,2}/)[^'?]+?\.js)(?:\?v=[^']*)?'"), r"\1?v=" + versao + "'"),
    # new URL('../../css/x.css', import.meta.url)
    (re.compile(r"(new URL\(\s*'(?:\.{1,2}/)[^'?]+?\.css)(?:\?v=[^']*)?'"), r"\1?v=" + versao + "'"),
]
padroes_html = [
    (re.compile(r'((?:src|href)="(?:js|css)/[^"?]+?\.(?:js|css))(?:\?v=[^"]*)?"'), r'\1?v=' + versao + '"'),
]

alterados = 0
for arquivo in (RAIZ / 'js').rglob('*.js'):
    texto = arquivo.read_text(encoding='utf-8')
    novo = texto
    for padrao, troca in padroes:
        novo = padrao.sub(troca, novo)
    if novo != texto:
        arquivo.write_text(novo, encoding='utf-8', newline='\n')
        alterados += 1

indice = RAIZ / 'index.html'
texto = indice.read_text(encoding='utf-8')
novo = texto
for padrao, troca in padroes_html:
    novo = padrao.sub(troca, novo)
if novo != texto:
    indice.write_text(novo, encoding='utf-8', newline='\n')
    alterados += 1

print(f'versão {versao}: {alterados} arquivos carimbados')
