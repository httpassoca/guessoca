# Guessoca

"Quem sou eu?" online entre amigos: cada pessoa tem um post-it na testa que todo mundo lê, menos ela, e descobre quem é perguntando em voz alta numa chamada de voz. O jogo acontece num telhado neon à noite, onde cada pessoa anda, pula e empurra os outros com o seu personagem. Este glossário fixa o vocabulário do domínio; o código usa identificadores em inglês, indicados entre parênteses.

## Linguagem

### Sala

**Sala** (`room`):
O lugar onde uma turma se reúne para jogar. Qualquer pessoa cria uma sala e entra por um código de quatro letras ou pelo link `/sala/CODE`. Vive em memória: sobrevive ao fim do jogo e morre depois de dez minutos sem atividade, levando junto as imagens dos post-its.
_Evitar_: lobby, partida, servidor, mesa

**Turma** (`members`):
As pessoas numa sala, de 2 a 8, conectadas ou não. Quem cai continua na turma até a sala morrer e volta com o mesmo token. "Jogar de novo com a mesma turma" leva todo mundo de volta ao lobby.
_Evitar_: grupo, time, jogadores, party

**Apelido** (`nickname`):
O nome que uma pessoa escolhe ao entrar na sala. Não há conta nem cadastro.
_Evitar_: usuário, login, conta

**Moderador** (`moderator`):
Quem criou a sala; se sai, a pessoa mais antiga da sala assume. Pode tudo, a qualquer momento: marcar alguém como acertou ou não (passa por cima da votação e desfaz uma revelação), pular uma vez, pausar o relógio, reordenar a turma, expulsar, passar o papel de moderador e encerrar o jogo. Joga normalmente ou escolhe só moderar, como fantasma.
_Evitar_: host, admin, dono da sala, mestre

**Fantasma** (`ghost`):
Pessoa na sala que não joga o jogo em andamento: quem chegou depois do começo, ou o moderador que escolheu só moderar. Vê todos os post-its, anda pelo telhado e entra no próximo jogo. Não vota.
_Evitar_: espectador, observador, viewer, spectator

**Fase** (`phase`):
Em que ponto a sala está: **lobby** (`lobby`), a turma se junta, escolhe personagens e a ordem; **escrita** (`writing`), cada pessoa escreve um post-it; **jogo** (`playing`), as vezes correm; **fim** (`ended`), o ranking e todos os post-its à mostra.
_Evitar_: estado, tela, etapa, round

### Post-it

**Post-it** (`postit`):
A identidade que uma pessoa usa na testa durante o jogo: um texto obrigatório de até 40 caracteres e uma imagem opcional, sempre juntos. Todo mundo vê o post-it dos outros, colado sobre a cabeça de cada personagem; o próprio aparece como "?" até ser revelado.
_Evitar_: carta, identidade, personagem (é o corpo), palavra, card

**Autor** (`author`) e **dono** (`owner`):
O autor escreve o post-it; o dono o usa na testa. Por padrão a ordem é um círculo: cada pessoa escreve para a próxima na ordem das vezes. O moderador pode arrastar a turma, trocar quem escreve para quem, ou **sortear** (`shuffleAuthors`), que embaralha sem ninguém escrever para si.
_Evitar_: escritor, alvo, target, destinatário

**Pronto** (`ready`):
O autor terminou o post-it. Os outros veem o post-it ao vivo enquanto ele é escrito, e o autor edita até apertar "Pronto". O jogo começa quando todo mundo está pronto, ou quando o moderador força; ao forçar, o moderador escreve os que faltam.
_Evitar_: enviar, confirmar, submit

**Imagem** (`image`):
A parte opcional do post-it. O navegador reduz para WebP de até 512 px antes de mandar por POST; o servidor guarda em memória e a imagem morre com a sala. O snapshot leva só o endereço.
_Evitar_: foto, anexo, upload, avatar

### Jogo

**Vez** (`turn`):
O tempo de uma pessoa perguntar, na ordem da turma. Dura 60 s por padrão; o moderador escolhe de 30 s a 3 min, de 15 em 15 s. As perguntas e respostas acontecem em voz alta, fora do jogo (no Discord); o jogo só mede o tempo. Tab passa a própria vez. A vez de quem está desconectado é pulada.
_Evitar_: turno, rodada, round, rodada de perguntas

**Acertei** (`claim`):
A pessoa da vez diz que descobriu quem é. O relógio para e abre uma votação. Só na própria vez.
_Evitar_: chutar, palpite, guess, resposta

**Votação** (`vote`):
"X acertou?": todas as outras pessoas conectadas votam sim ou não, menos quem pediu e os fantasmas. Fecha em 15 s; quem não votou se abstém. Ganha a maioria dos votos dados, e o empate conta como sim. Sim: o post-it é revelado para o dono, ele entra no ranking e a próxima vez começa. Não: a vez continua com o tempo que sobrava. Ninguém desfaz o resultado, só o moderador.
_Evitar_: julgamento, enquete, poll, verificação

**Desistir** (`giveUp`):
A pessoa revela o próprio post-it e vai para o fim do ranking.
_Evitar_: render-se, pular (pular é passar a vez), forfeit

**Ranking** (`ranking`):
A ordem em que as pessoas acertaram; quem desistiu fica no fim, na ordem em que desistiu. O jogo acaba quando toda pessoa conectada acertou ou desistiu.
_Evitar_: placar, pontuação, classificação, score

**Bloco** (`notepad`):
As anotações de cada pessoa durante o jogo. Pessoais, por aba; ninguém mais vê.
_Evitar_: notas, chat, caderno

### Telhado

**Telhado** (`world`):
O mundo sempre ligado: entrar na sala põe a pessoa no telhado. Lobby, escrita, jogo e fim são painéis HTML por cima. São telhados separados por vãos, umas duas telas de largura, num beat 'em up 2.5D: andar para os lados e em profundidade, e pular. A câmera segue a própria pessoa.
_Evitar_: mapa, fase, level, cenário, cena

**Personagem** (`character`):
O corpo de cada pessoa no telhado. São oito, iguais menos a cor do cabelo; cada pessoa escolhe um no lobby, único na sala. Os corpos são sólidos: não se atravessa um grupo, pula-se por cima, e dá para ficar na cabeça de alguém e ser carregado.
_Evitar_: avatar, boneco, skin, sprite (é o desenho), herói

**Empurrão** (`shove`):
J empurra quem está na frente, que é jogado para trás e pode cair do telhado. Cair na rua faz o personagem piscar e voltar em 1,5 s na plataforma mais alta do meio. Cair não muda nada no jogo.
_Evitar_: ataque, soco, golpe, hit

**Emote** (`emote`):
Um balão de pixel sobre a cabeça por uns 2 s: `?`, `!`, `haha` e "eu?".
_Evitar_: reação, emoji, fala

**Presença** (`presence`):
Onde o personagem de uma pessoa está, como se move e o que anima. Sai de cada aba umas quinze vezes por segundo e chega às outras por fora do estado da sala; não conta como atividade.
_Evitar_: posição, tracking, telemetria, sync

### Interface

**Idioma** (`lang`):
A língua da interface, escolhida por navegador: português (pt-BR), o padrão, ou inglês (en-US). Toda frase passa por uma tabela só. O que a turma escreve (apelidos e post-its) não se traduz.
_Evitar_: locale, tradução (é o mecanismo, não a escolha)

**Jogador falso** (`fakePlayer`):
Pessoa inventada para testar sozinho, só em localhost ou com `?dev`, nunca em produção. Escreve uma identidade ao acaso, fica parada no telhado e pula as próprias vezes.
_Evitar_: bot, NPC, IA, dummy
