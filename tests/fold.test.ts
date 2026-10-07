/* Recherche de personnes tolérante (rattachement d'un compte, recherche globale de CEA OS). */
import { describe, it, expect } from 'vitest';
import { words } from '../src/lib/fold';
import { search } from '../src/lib/fuzzy';

const people = [
  { name: 'Aïcha Agbodjan', email: 'aicha@cea.demo' },
  { name: 'Jean-Marc Ekotto', email: 'jeanmarc@cea.demo' },
  { name: 'Kossi Agbéko', email: 'k.agbeko@cea4africa.com' },
];
const find = (q: string) => search(people, q, (p) => [p.name, p.email], 5).map((p) => p.name);

describe('words', () => {
  it('simplifie accents, majuscules et séparateurs', () => {
    expect(words('  AÏCHA,  Agbodjan ')).toEqual(['aicha', 'agbodjan']);
  });
  it('retire les jokers SQL', () => {
    expect(words('a%b_c')).toEqual(['abc']);
  });
});

describe('recherche de personnes', () => {
  it('ignore majuscules et accents', () => {
    expect(find('AICHA')).toEqual(['Aïcha Agbodjan']);
    expect(find('agbeko')).toEqual(['Kossi Agbéko']);
  });
  it('accepte le nom et le prénom dans les deux ordres', () => {
    expect(find('Agbodjan Aïcha')).toEqual(['Aïcha Agbodjan']);
    expect(find('aicha agbodjan')).toEqual(['Aïcha Agbodjan']);
  });
  it('trouve les prénoms composés, avec ou sans trait d’union', () => {
    expect(find('jean marc ekotto')).toEqual(['Jean-Marc Ekotto']);
    expect(find('Ekotto Jean-Marc')).toEqual(['Jean-Marc Ekotto']);
  });
  it('tolère une faute de frappe', () => {
    expect(find('Agbodjam')).toEqual(['Aïcha Agbodjan']);
  });
});
