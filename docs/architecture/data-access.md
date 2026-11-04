# Padrões de Acesso a Dados — Mangá Atlas

Este documento descreve como os dados são consumidos, tipados, abstraídos e normalizados no projeto.

---

## 1. Padrão Repository e Injeção de Dependências

O acesso a dados no frontend é baseado no padrão **Repository** associado a um `InjectionToken` do Angular:

```typescript
// src/app/core/data/manga.repository.ts
export interface MangaRepository {
  list(): Promise<readonly Manga[]>;
  findBySlug(slug: string): Promise<Manga | undefined>;
}

export const MANGA_REPOSITORY = new InjectionToken<MangaRepository>('MANGA_REPOSITORY', {
  providedIn: 'root',
  factory: () => inject(MockMangaRepository),
});
```

### Vantagens dessa abordagem:

1. **Desacoplamento do backend:** as páginas dependem apenas do contrato `MangaRepository`.
2. **Facilidade em testes:** os testes unitários podem substituir o repositório por objetos simulados (`useValue: fakeRepo`) sem requisições HTTP reais.
3. **Substituição transparente:** quando a API definitiva estiver pronta, basta implementar `HttpMangaRepository` e atualizar o provider sem alterar nenhuma linha dos componentes.

---

## 2. Diferenciação Crítica de Temporalidades

Na coleta e exibição de dados de mangás, é fundamental não misturar conceitos de tempo:

| Conceito                         | Descrição                                              | Exemplo de Campo              |
| -------------------------------- | ------------------------------------------------------ | ----------------------------- |
| **Data Efetiva de Lançamento**   | Data em que o volume chegou às bancas ou livrarias.    | `release.value`               |
| **Data Prevista de Lançamento**  | Estimativa anunciada pela editora (sujeita a atrasos). | `release.status = 'planned'`  |
| **Data de Observação do Preço**  | Momento em que o robô de coleta capturou o valor.      | `PriceObservation.observedAt` |
| **Data de Modificação da Ficha** | Timestamp de edição do cadastro no BBM ou banco.       | `manga.updatedAt`             |

> [!CAUTION]
> **Aviso sobre histórico de preços:** Uma alteração detectada no site de origem (BBM ou loja) indica apenas que o valor estava diferente no momento da observação. **Não se deve inferir que o reajuste ocorreu na data em que a página foi raspada.**

---

## 3. Contratos de Domínio vs DTOs de Coleta

- **Modelos de Domínio (`Manga`, `Volume`, `ReleaseDate`):** utilizados pela interface Angular, com nomes padronizados em português/inglês limpo e estruturas normalizadas.
- **DTOs da Coleta BBM (`BBMEntry`, `BBMDetails`):** modelos transitórios do coletor Python, refletindo o formato de tabelas e metadados brutos extraídos do HTML.
- **Normalizador:** o coletor converte DTOs brutos em registros canônicos de observação antes do armazenamento.
