# Estratégia de Testes Unitários — Mangá Atlas

O Mangá Atlas utiliza o **Vitest** como motor de testes unitários oficial do frontend, integrado nativamente através do builder `@angular/build:unit-test`.

---

## 1. Princípios Gerais

- **Extensão padrão:** todos os arquivos de teste devem ter o sufixo `.spec.ts`.
- **Proximidade:** o teste deve residir no mesmo diretório do arquivo que está sendo testado (ex.: `manga-card.component.ts` e `manga-card.component.spec.ts`).
- **Padrão AAA (Arrange, Act, Assert):**
  1. _Arrange:_ configurar providers, criar TestBed e instanciar componente com inputs mockados.
  2. _Act:_ disparar ações, eventos de clique ou chamadas de método.
  3. _Assert:_ verificar alterações no DOM, emissões de outputs ou chamadas a spies.
- **Determinismo e isolamento:** testes nunca realizam chamadas de rede externas ou operações assíncronas infinitas.

---

## 2. Exemplo de Teste de Componente Standalone

```typescript
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { MangaCardComponent } from './manga-card.component';
import type { Manga } from '../../models/manga.model';

describe('MangaCardComponent', () => {
  let fixture: ComponentFixture<MangaCardComponent>;
  let component: MangaCardComponent;

  const mockManga: Manga = {
    id: 'm-1',
    slug: 'vinland-saga',
    title: 'Vinland Saga',
    publisher: 'Panini',
    category: 'Seinen',
    description: 'História épica.',
    accent: '#2c3e50',
    initials: 'VS',
    volumes: [],
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MangaCardComponent],
      providers: [provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(MangaCardComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('manga', mockManga);
    fixture.detectChanges();
  });

  it('deve renderizar o título do mangá', () => {
    expect(component).toBeTruthy();
    const titleEl = fixture.nativeElement.querySelector('h3');
    expect(titleEl?.textContent).toContain('Vinland Saga');
  });
});
```

---

## 3. Exemplo de Teste de Serviço / Repositório

```typescript
import { TestBed } from '@angular/core/testing';
import { MockMangaRepository, MANGA_REPOSITORY } from './manga.repository';

describe('MockMangaRepository', () => {
  let repository: MockMangaRepository;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [MockMangaRepository],
    });
    repository = TestBed.inject(MockMangaRepository);
  });

  it('deve listar as obras', async () => {
    const list = await repository.list();
    expect(list.length).toBeGreaterThan(0);
  });
});
```

---

## 4. Execução dos Testes e Cobertura

Para rodar todos os testes uma única vez:

```bash
npm run test -- --watch=false
```

Para rodar em modo contínuo de observação (TDD):

```bash
npm run test:watch
```

Para gerar relatório de cobertura de código (armazenado em `coverage/`):

```bash
npm run test:coverage
```

O relatório do collector pode ser gerado localmente com `py -m pytest collector/tests --cov=collector.src --cov-report=term-missing`. A cobertura das rotas Fastify é exibida com `npm run test:api -- --coverage`.

Os testes PostgreSQL do collector são opt-in: defina `COLLECTOR_TEST_DATABASE_URL` para uma base isolada vazia/de validação antes de executar pytest. Eles criam e alteram registros nessa base. Não aponte a variável para dados de produção ou para a base principal de desenvolvimento. Consulte [Validação do collector](../testing/collector-import-validation.md) para os comandos e resultados medidos.

Na validação SPEC-007 (04/11/2026), a cobertura medida foi: Angular 75,34% de linhas, API 70,40% de linhas e collector 82% de statements. Esses percentuais refletem as suítes atuais e não são limites mínimos configurados.

Na validação incremental SPEC-008, a suíte do collector executou 27 testes com integração PostgreSQL e mediu 81% de cobertura de statements (`py -m pytest collector/tests --cov=collector.src --cov-report=term-missing`). Esses números são registros históricos, não medições do estado atual.

Na validação SPEC-014 (06/11/2026), `npm run check` passou: 33 testes Angular, 19 testes de rotas/API, lint e build. `npm run test:coverage` passou com 72,36% de linhas Angular. `py -m pytest collector/tests --cov=collector.src --cov-report=term-missing` passou com 71 testes e 66% de statements; 9 testes PostgreSQL opt-in foram pulados porque nenhum banco isolado foi informado. `npm run lint:collector` passou. Em bancos PostgreSQL temporários foram confirmadas duas publicações com número de volume repetido e preços distintos, idempotência de reimport e migração de uma edição legada para a editora brasileira. Uma simulação BBM real encontrou 19 volumes e 19 preços sem gravar no banco. O reparse persistente segue em andamento; progresso e dump intermediário estão no [relatório de auditoria do Collector](../collector/audit-report.md).
