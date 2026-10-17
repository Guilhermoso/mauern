// Fragmentos de história encontrados nos locais de história fora dos muros.
// Cada um revela um pouco do que aconteceu antes de os titãs tomarem estas terras.

export interface LoreFragment {
  title: string;
  text: string;
}

export const LORE: LoreFragment[] = [
  {
    title: 'Diário de um agrimensor',
    text:
      '"Medimos o vale três vezes e as contas não fecham: há cidades nos mapas antigos que hoje são só mato. ' +
      'Não há cinzas nem escombros de guerra — as casas estão de pé, vazias, com a mesa posta. Como se todos tivessem saído ao mesmo tempo."',
  },
  {
    title: 'Inscrição numa pedra de marco',
    text:
      '"Até aqui chega a lei do rei. Além desta pedra, cada um por si." A pedra está a dois dias de caminhada do refúgio. ' +
      'Alguém riscou por cima, com letra apressada: "Eles não respeitam a pedra."',
  },
  {
    title: 'Carta nunca entregue',
    text:
      '"Minha irmã, os gigantes não comem por fome. Vi um deles devorar um homem e, logo depois, devolver tudo, como quem não sente o gosto. ' +
      'Não buscam alimento. Buscam a nós. Não confie em quem diz que eles são só bestas."',
  },
  {
    title: 'Registro de um mosteiro',
    text:
      '"No inverno do Grande Silêncio, os sinos tocaram sozinhos por uma noite inteira. Na manhã seguinte, o primeiro deles estava parado no portão, ' +
      'olhando para dentro, sorrindo. Os irmãos juraram que ele tinha o rosto de alguém da aldeia."',
  },
  {
    title: 'Mapa rasgado',
    text:
      'Um mapa desenhado à mão mostra um anel de muralhas que não existe em nenhum outro registro, muito maior que qualquer vila. ' +
      'No centro, uma única palavra, apagada pela chuva até ficar ilegível. Nas margens, alguém contou os dias: trezentos e doze.',
  },
  {
    title: 'Ossos marcados',
    text:
      'Junto a uma fogueira antiga, ossos grandes demais para um homem e pequenos demais para um gigante. Têm marcas de ferramentas, ' +
      'como se alguém tivesse tentado entender do que eram feitos. Ao lado, um caderno com uma só frase: "Eles foram gente."',
  },
];
