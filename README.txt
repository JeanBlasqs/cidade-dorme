# 🌙 Cidade Dorme

Jogo de dedução social multiplayer em tempo real, jogado direto no navegador
— cada jogador no seu próprio dispositivo. Inspirado em Lobisomem/Mafia, com
papéis, noite e dia, votação e uma dinâmica de pistas em desenvolvimento.

**Jogando agora:** [cidade-dorme-phi.vercel.app](https://cidade-dorme-phi.vercel.app)

---

## Índice

- [Sobre o jogo](#sobre-o-jogo)
- [Como jogar](#como-jogar)
- [Papéis](#papéis)
- [Stack técnica](#stack-técnica)
- [Estrutura do projeto](#estrutura-do-projeto)
- [Como rodar localmente](#como-rodar-localmente)
- [Configuração do Supabase](#configuração-do-supabase)
- [Deploy](#deploy)
- [Roadmap](#roadmap)

---

## Sobre o jogo

**Cidade Dorme** é um jogo de dedução social para grupos de 4 ou mais
pessoas. Um anfitrião cria uma sala, compartilha o código, e cada
participante entra pelo próprio dispositivo. Papéis são sorteados em segredo, e
o jogo alterna entre fases de **noite** (ações secretas) e **dia**
(discussão e votação) até que a cidade elimine todos os assassinos, ou os
assassinos dominem a cidade.

Não existe servidor de jogo dedicado nem app para instalar — tudo roda
como uma página web estática, sincronizada em tempo real através do
Supabase.

## Como jogar

1. O anfitrião clica em **Criar sala** e recebe um código de 5 letras.
2. Os outros jogadores clicam em **Entrar na sala**, digitam o código e o
   nome.
3. Com 4 ou mais jogadores na sala, o anfitrião pode ajustar o tempo de
   discussão e de votação, e então clicar em **Iniciar jogo**.
4. Cada jogador vê seu papel em segredo e 3 traços sobre si que são revelados pra cada jogador,
   ao começo de cada rodada é revelado uma pista sobre o assassino.
5. O jogo alterna automaticamente entre:
   - **Noite** — quem tem ação (Assassino, Anjo, Detetive) escolhe um alvo
     em silêncio. A rodada avança sozinha assim que todas as ações
     necessárias forem confirmadas.
   - **Amanhecer** — revela se alguém morreu.
   - **Discussão** — tempo cronometrado para conversar e levantar suspeitas.
   - **Votação** — cada jogador vivo vota em quem quer eliminar (ou pular).
   - **Resultado da votação** — revela quem foi eliminado.
6. O jogo termina quando todos os assassinos forem eliminados (cidade
   vence) ou quando os assassinos igualarem/superarem os demais em número
   (assassinos vencem).
7. Ao final, o anfitrião pode reiniciar a partida na mesma sala, sem
   precisar criar uma nova.

## Papéis

| Papel | Ação | Time |
|---|---|---|
| 🔪 **Assassino** | Toda noite, escolhe uma vítima junto dos outros assassinos. | Assassinos |
| 🕊️ **Anjo** | Toda noite, escolhe alguém para proteger de um ataque. | Cidade |
| 🔎 **Detetive** | Toda noite, investiga uma pessoa e recebe um sinal (papel especial ou não) sem saber qual exatamente. | Cidade |
| 🌾 **Cidadão** | Sem poderes especiais. Depende da conversa e do voto. | Cidade |

Com exatamente 4 jogadores, os quatro papéis sempre existem. Acima disso,
todo jogador extra entra como Cidadão comum.

## Stack técnica

- **Frontend:** HTML, CSS e JavaScript puros (sem framework, sem build step)
- **Sincronização em tempo real:** [Supabase](https://supabase.com)
  (Postgres + Realtime, via `postgres_changes`)
- **Hospedagem:** [Vercel](https://vercel.com) (site estático)
- **Áudio:** efeitos sonoros de transição (sino e coruja) em `assets/audio`
- **Identidade do jogador:** gerada em memória no navegador por sessão
  (ver [Limitações conhecidas](#limitações-conhecidas))

Não há back-end próprio: o navegador de cada jogador fala diretamente com o
Supabase.

## Estrutura do projeto

```
.
├── index.html          # estrutura da página, carrega style.css e app.js
├── style.css           # todo o visual do jogo
├── app.js              # estado, lógica de jogo e comunicação com o Supabase
└── assets/
    ├── audio/          # sons de transição da noite (sino, coruja)
    └── roles/          # imagens dos papéis usadas na revelação
```

## Como rodar localmente

Como não há build step, basta servir os arquivos estáticos:

```bash
git clone <url-do-repositorio>
cd cidade-dorme
npx serve .
```

Abra o endereço indicado no terminal. Para testar o multiplayer sozinho,
abra a mesma URL em abas ou navegadores diferentes (cada aba é um
jogador).

> É necessário ter um projeto Supabase configurado (veja a seção abaixo)
> antes de qualquer coisa funcionar — sem isso, criar/entrar em sala falha
> silenciosamente.

## Configuração do Supabase

1. Crie um projeto gratuito em [supabase.com](https://supabase.com).
2. No **SQL Editor**, rode o script de criação de tabelas do projeto
   (cria `rooms`, `players`, `night_actions` e `votes`, com Row Level
   Security liberada para leitura/escrita pública e Realtime ativado
   nessas tabelas).
3. Em **Project Settings → API**, copie a **Project URL** e a chave
   **anon public**.
4. Cole esses dois valores nas constantes `SUPABASE_URL` e
   `SUPABASE_ANON_KEY` no início do `app.js`.

## Deploy

O projeto é compatível com qualquer hospedagem de site estático. Para
publicar na Vercel:

1. Suba os arquivos (`index.html`, `style.css`, `app.js`, `assets/`) para
   um repositório no GitHub.
2. Importe o repositório na Vercel — nenhuma configuração de build é
   necessária, é servido como estático.
3. Confirme que a **Deployment Protection** está desativada para produção,
   ou os jogadores serão obrigados a logar na Vercel para acessar o jogo.
4. Compartilhe a URL de produção (sem sufixo de preview/hash) com o grupo.

## Roadmap

- [ ] Sessão de jogador persistente (Supabase Auth anônimo + cookie)
- [ ] Políticas de RLS restritas por identidade, não abertas
- [ ] Ações sensíveis do jogo (resolver noite, apurar votos) movidas para
      funções no servidor (RPC/Edge Function), tirando a confiança do
      JavaScript do cliente
- [ ] Sistema de pistas por traços (onde estava / o que levava / o que
      vestia / viu alguém), substituindo qualquer mecânica futura de casos
      fixos, com configuração pelo anfitrião no lobby
- [ ] Separação do `app.js` em módulos por responsabilidade
      (estado, banco de dados, regras do jogo, telas)
- [ ] Avaliação de migração para React/TypeScript, se o volume de
      funcionalidades justificar

---

Feito para jogar com amigos. Contribuições e sugestões são bem-vindas.