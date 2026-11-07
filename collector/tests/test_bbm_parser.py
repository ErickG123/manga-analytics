from decimal import Decimal
from pathlib import Path

from collector.src.normalizers.data_normalizer import (
    parse_brazilian_date,
    parse_price_brl,
)
from collector.src.parsers.bbm_parser import parse_bbm_page, parse_bbm_publisher


def test_parse_price_brl():
    assert parse_price_brl("R$ 39,90") == Decimal("39.90")
    assert parse_price_brl("Preço de capa: R$ 124,50") == Decimal("124.50")
    assert parse_price_brl("—") is None
    assert parse_price_brl("") is None


def test_parse_brazilian_date_formats():
    val, prec, y, m, d = parse_brazilian_date("15/04/2026")
    assert val == "15/04/2026"
    assert prec == "day"
    assert (y, m, d) == (2026, 4, 15)

    val_m, prec_m, y_m, m_m, d_m = parse_brazilian_date("maio de 2026")
    assert val_m == "05/2026"
    assert prec_m == "month"
    assert (y_m, m_m, d_m) == (2026, 5, None)

    val_y, prec_y, y_y, m_y, d_y = parse_brazilian_date("2027")
    assert val_y == "2027"
    assert prec_y == "year"
    assert (y_y, m_y, d_y) == (2027, None, None)


def test_parse_bbm_page_fixture():
    fixture_path = Path(__file__).parent / "fixtures" / "sample_bbm_page.html"
    html = fixture_path.read_text(encoding="utf-8")
    data = parse_bbm_page(html, "One Piece Aventura Escolar")

    assert data["title"] == "One Piece Aventura Escolar"
    assert data["author"] == "Autor: Souhei Kouji"
    assert data["publisher"] == "Panini"
    assert len(data["volumes"]) == 3
    assert data["volumes"][0]["price_amount"] == Decimal("39.90")
    assert data["volumes"][0]["release_date"] == "15/04/2026"
    assert data["volumes"][1]["release_date_precision"] == "month"
    assert data["volumes"][2]["release_status"] == "unknown"
    assert data["volume_parse_complete"] is True


def test_parser_collects_all_labeled_creator_credits_and_deduplicates_them():
    html = """<div class="entry-content">
      <p><strong>Autor:</strong> Tsugumi Ohba</p>
      <p><strong>Roteiro:</strong> Tsugumi Ohba</p>
      <p><strong>Arte:</strong> Takeshi Obata</p>
      <p><strong>Desenho:</strong> Takeshi Obata</p>
      <p><strong>Arte:</strong> Takeshi Obata</p>
      <p><strong>Editora:</strong> Panini</p>
    </div>"""

    parsed = parse_bbm_page(html, "Obra com vários créditos")

    assert parsed["author"] == (
        "Autor: Tsugumi Ohba; Roteiro: Tsugumi Ohba; Arte: Takeshi Obata; "
        "Desenho: Takeshi Obata"
    )
    assert parsed["publisher"] == "Panini"


def test_parse_bbm_table_with_data_cells_as_headers():
    html = """<table><tr><td>Vol.</td><td>Japão</td><td>Brasil</td><td>Preço</td></tr>
    <tr><td># 01</td><td>02/02/2020</td><td>05/08/2027</td><td>R$ 42,90</td></tr></table>"""
    parsed = parse_bbm_page(html, "Obra de teste")
    volume = parsed["volumes"][0]
    assert volume["number"] == 1
    assert volume["release_date"] == "05/08/2027"
    assert volume["release_status"] == "planned"
    assert volume["price_amount"] == Decimal("42.90")


def test_parser_expands_rowspans_for_brazilian_release_date_and_price():
    html = """<table>
      <tr><th>Vol.</th><th>Japão</th><th>Brasil</th><th>Preço</th><th>Compre em</th></tr>
      <tr><td># 01</td><td>03/08/2007</td><td rowspan="2">#01 – 12/2018</td>
        <td rowspan="2">R$ 44,90</td><td rowspan="2">Amazon</td></tr>
      <tr><td># 02</td><td>05/12/2007</td></tr>
      <tr><td># 03</td><td>05/06/2008</td><td rowspan="2">#02 – 12/2018</td>
        <td rowspan="2">R$ 44,90</td><td rowspan="2">Amazon</td></tr>
      <tr><td># 04</td><td>30/01/2009</td></tr>
    </table>"""

    parsed = parse_bbm_page(html, "Boa Noite Punpun")

    assert parsed["volume_table_found"] is True
    assert parsed["volume_rows_skipped"] == 0
    assert parsed["volume_parse_complete"] is True
    assert [volume["number"] for volume in parsed["volumes"]] == [1, 2]
    assert all(volume["release_date"] == "12/2018" for volume in parsed["volumes"])
    assert all(
        volume["price_amount"] == Decimal("44.90") for volume in parsed["volumes"]
    )


def test_parser_collects_box_as_a_separate_publication_format():
    html = """<table>
      <tr><th>Vol.</th><th>Japão</th><th>Brasil</th><th>Preço</th><th>Compre em</th></tr>
      <tr><td># 01</td><td>03/08/2007</td><td>#01 – 12/2018</td>
        <td>R$ 44,90</td><td>Amazon</td></tr>
      <tr><td>Box</td><td>—</td><td>12/2019</td><td>R$ 282,90</td>
        <td>Amazon</td></tr>
    </table>"""

    parsed = parse_bbm_page(html, "Boa Noite Punpun")

    assert parsed["volume_parse_complete"] is True
    assert parsed["volume_rows_skipped"] == 0
    assert len(parsed["publications"]) == 2
    box = parsed["publications"][1]
    assert box["source_key"] == "edicao_brasileira_box"
    assert box["name"] == "Box"
    assert box["format_type"] == "box_set"
    assert box["format_label"] == "Box"
    assert len(box["volumes"]) == 1
    assert box["volumes"][0]["title"] == "Box"
    assert box["volumes"][0]["release_date"] == "12/2019"
    assert box["volumes"][0]["price_amount"] == Decimal("282.90")


def test_parser_ignores_spanned_subseries_headings_without_losing_volume_rows():
    html = """<table>
      <tr><th>Vol.</th><th>Japão</th><th>Brasil</th><th>Preço</th></tr>
      <tr><td colspan="4">POKÉMON YELLOW</td></tr>
      <tr><td># 01</td><td>1998</td><td>05/08/2020</td><td>R$ 29,90</td></tr>
    </table>"""

    parsed = parse_bbm_page(html, "Pokémon")

    assert parsed["volume_parse_complete"] is True
    assert parsed["volume_rows_skipped"] == 0
    assert len(parsed["volumes"]) == 1
    assert "POKÉMON YELLOW" in parsed["publications"][0]["format_evidence"]


def test_parser_uses_explicit_one_volume_metadata_for_hash_only_row():
    html = """<p>Nº de volumes no Brasil: 1</p>
      <p>Publicado no Brasil em: Agosto de 2014</p>
      <table><tr><th>Vol</th><th>Data no Japão</th><th>Data no Brasil</th>
        <th>Preço</th></tr>
      <tr><td>#</td><td>26/04/2010</td><td>Agosto de 2014</td>
        <td>R$ 17,90</td></tr></table>"""

    parsed = parse_bbm_page(html, "A Interpretação dos Sonhos")

    assert parsed["volume_parse_complete"] is True
    assert parsed["volume_rows_skipped"] == 0
    assert len(parsed["volumes"]) == 1
    assert parsed["volumes"][0]["number"] == 1
    assert parsed["volumes"][0]["release_date"] == "08/2014"
    assert parsed["volumes"][0]["price_amount"] == Decimal("17.90")


def test_parser_distinguishes_chapter_tables_from_volume_tables():
    html = """<table>
      <tr><th>Cap.</th><th>Japão</th><th>Brasil</th><th>Preço</th></tr>
      <tr><td>Capítulo 01</td><td>—</td><td>29/10/2026</td><td>—</td></tr>
    </table>"""

    parsed = parse_bbm_page(html, "Webtoon sem edição impressa")

    assert parsed["chapter_table_found"] is True
    assert parsed["volume_table_found"] is False
    assert parsed["volumes"] == []


def test_parser_keeps_digital_edition_as_a_separate_publication():
    html = """<p><strong>EDIÇÃO DIGITAL</strong></p>
      <table><tr><th>Vol.</th><th>Brasil</th><th>Preço</th></tr>
      <tr><td># 01</td><td>19/07/2019</td><td>R$ 32,90</td></tr></table>"""

    parsed = parse_bbm_page(html, "Boa Noite Punpun")

    assert parsed["volume_parse_complete"] is True
    assert len(parsed["publications"]) == 1
    publication = parsed["publications"][0]
    assert publication["name"] == "EDIÇÃO DIGITAL"
    assert publication["source_key"] == "edicao_digital"
    assert publication["format_type"] == "digital_edition"
    assert publication["format_label"] == "Edição digital"
    assert publication["volumes"][0]["price_amount"] == Decimal("32.90")


def test_parser_keeps_later_digital_release_as_a_named_variant():
    html = """<p><strong>EDIÇÃO DIGITAL</strong></p>
      <table><tr><th>Vol.</th><th>Brasil</th><th>Preço</th></tr>
      <tr><td>#01</td><td>05/03/2020</td><td>R$ 39,90</td></tr>
      <tr><td>#01</td><td>11/09/2023</td><td>R$ 64,90</td></tr></table>"""

    parsed = parse_bbm_page(html, "Dementia 21")

    assert parsed["volume_parse_complete"] is True
    assert parsed["conflicting_volume_numbers"] == []
    volume = parsed["publications"][0]["volumes"][0]
    assert volume["price_amount"] == Decimal("39.90")
    assert volume["variants"][0]["name"] == "Reedição digital de 11/09/2023"
    assert volume["variants"][0]["price_amount"] == Decimal("64.90")


def test_parser_reads_box_complete_heading_and_publication_date_column():
    html = """<p><strong>2ª PUBLICAÇÃO (BOX COMPLETO)</strong></p>
      <p>Lançamento: junho de 2024</p>
      <table><tr><th>Volume</th><th>Data de publicação</th><th>Preço</th></tr>
      <tr><td>#</td><td>14/06/2024</td><td>R$ 369,90</td></tr></table>"""

    parsed = parse_bbm_page(html, "Your Lie In April")

    assert parsed["volume_parse_complete"] is True
    publication = parsed["publications"][0]
    assert publication["name"] == "2ª PUBLICAÇÃO (BOX COMPLETO)"
    assert publication["source_key"] == "2a_publicacao_box_completo"
    assert publication["format_type"] == "box_set"
    assert publication["volumes"][0]["number"] == 1
    assert publication["volumes"][0]["title"] == "Box"
    assert publication["volumes"][0]["release_date"] == "14/06/2024"
    assert publication["volumes"][0]["price_amount"] == Decimal("369.90")


def test_parser_saves_bundle_row_with_source_description_as_box_publication():
    html = """<table>
      <tr><th>Vol.</th><th>Japão</th><th>Brasil</th><th>Preço</th></tr>
      <tr><td>—</td><td>Caixa junto com o mangá Nossas Cores</td>
        <td>12/2025</td><td>R$ 224,50</td></tr>
    </table>"""

    parsed = parse_bbm_page(html, "O Marido do Meu Irmão")

    assert parsed["volume_parse_complete"] is True
    publication = parsed["publications"][0]
    assert publication["name"] == "Caixa junto com o mangá Nossas Cores"
    assert publication["source_key"].endswith("caixa_junto_com_o_manga_nossas_cores")
    assert publication["format_type"] == "box_set"
    assert publication["volumes"][0]["title"] == publication["name"]
    assert publication["volumes"][0]["release_date"] == "12/2025"
    assert publication["volumes"][0]["price_amount"] == Decimal("224.50")


def test_parser_preserves_non_volume_sample_as_source_evidence():
    html = """<table>
      <tr><th>Vol.</th><th>Japão</th><th>Brasil</th><th>Preço</th></tr>
      <tr><td># 01</td><td>2010</td><td>05/08/2020</td><td>R$ 29,90</td></tr>
      <tr><td>Amostra</td><td>Dia do Quadrinho Grátis</td>
        <td>22/11/2025</td><td>Grátis</td></tr>
    </table>"""

    parsed = parse_bbm_page(html, "The Ancient Magus Bride")

    assert parsed["volume_parse_complete"] is True
    assert parsed["volume_rows_skipped"] == 0
    assert len(parsed["volumes"]) == 1
    evidence = parsed["publications"][0]["format_evidence"]
    assert "Dia do Quadrinho Grátis" in evidence


def test_chapter_only_page_is_a_complete_catalog_sync_without_print_volumes():
    html = """<table><tr><th>Capítulo</th><th>Data</th></tr>
    <tr><td>1</td><td>01/01/2025</td></tr></table>"""

    parsed = parse_bbm_page(html, "Webtoon sem edição impressa")

    assert parsed["chapter_table_found"] is True
    assert parsed["volume_table_found"] is False
    assert parsed["volumes"] == []
    assert parsed["volume_parse_complete"] is True


def test_parser_keeps_compilation_and_special_chapter_release_data():
    html = """<table><tr><th>Vol.</th><th>Brasil</th><th>Preço</th></tr>
    <tr><td>Comp.</td><td>1999</td><td>R$ 6,90</td></tr>
    <tr><td>Capítulo Especial</td><td>12/02/2020</td><td>R$ 12,90</td></tr>
    <tr><td>Etc.</td><td>—</td><td>—</td></tr></table>"""

    parsed = parse_bbm_page(html, "Obra com itens especiais")

    assert parsed["volume_rows_skipped"] == 0
    special_publications = parsed["publications"]
    assert [item["name"] for item in special_publications] == [
        "Comp.",
        "Capítulo Especial",
    ]
    assert [item["volumes"][0]["price_amount"] for item in special_publications] == [
        Decimal("6.90"),
        Decimal("12.90"),
    ]
    assert parsed["volume_parse_complete"] is True


def test_parser_captures_kit_and_set_rows_as_box_publications():
    html = """<table><tr><th>Vol.</th><th>Descrição</th><th>Brasil</th><th>Preço</th></tr>
    <tr><td>—</td><td>Kit – #01 e #02</td><td>12/2026</td><td>R$ 95,90</td></tr>
    <tr><td>#conjunto</td><td>—</td><td>23/06/2022</td><td>R$ 119,00</td></tr>
    <tr><td>—</td><td>Pack especial com volumes #01 e #02</td>
    <td>16/03/2020</td><td>R$ 24,90</td></tr></table>"""

    parsed = parse_bbm_page(html, "Obra com conjuntos")

    boxes = [
        publication
        for publication in parsed["publications"]
        if publication["format_type"] == "box_set"
    ]
    assert len(boxes) == 3
    assert boxes[0]["name"] == "Kit – #01 e #02"
    assert boxes[0]["volumes"][0]["price_amount"] == Decimal("95.90")
    assert boxes[1]["name"] == "#conjunto"
    assert boxes[1]["volumes"][0]["price_amount"] == Decimal("119.00")
    assert boxes[2]["name"] == "Pack especial com volumes #01 e #02"
    assert boxes[2]["volumes"][0]["price_amount"] == Decimal("24.90")


def test_parser_ignores_etc_placeholder_rows_without_marking_incomplete():
    html = """<table><tr><th>Vol.</th><th>Brasil</th><th>Preço</th></tr>
    <tr><td>#1</td><td>01/01/2020</td><td>R$ 30,00</td></tr>
    <tr><td>Etc..</td><td>Etc…</td><td>—</td></tr></table>"""

    parsed = parse_bbm_page(html, "Obra com linhas de continuação")

    assert parsed["volume_rows_skipped"] == 0
    assert parsed["volume_parse_complete"] is True
    assert [volume["number"] for volume in parsed["volumes"]] == [1]


def test_parser_merges_repeated_tables_for_the_same_publication():
    html = """<table><tr><th>Vol.</th><th>Brasil</th><th>Preço</th></tr>
    <tr><td>#20</td><td>01/01/2020</td><td>R$ 29,90</td></tr></table>
    <table><tr><th>Vol.</th><th>Brasil</th><th>Preço</th></tr>
    <tr><td>#20</td><td>01/01/2020</td><td>R$ 49,90</td></tr>
    <tr><td>#21</td><td>01/02/2020</td><td>R$ 29,90</td></tr></table>"""

    parsed = parse_bbm_page(html, "Obra em tabelas repetidas")

    assert len(parsed["publications"]) == 1
    assert parsed["publications"][0]["source_key"] == "edicao_brasileira"
    assert [volume["number"] for volume in parsed["volumes"]] == [20, 21]
    assert parsed["volumes"][0]["price_amount"] == Decimal("29.90")
    assert parsed["volumes"][0]["variants"][0]["price_amount"] == Decimal("49.90")
    assert parsed["volume_parse_complete"] is True


def test_parser_uses_brazil_column_volume_number_for_merged_japanese_volume_cell():
    html = """<table><tr><th>Vol.</th><th>Japão</th><th>Brasil</th><th>Preço</th></tr>
    <tr><td>#01 #02 #03 #04</td><td>datas japonesas</td>
      <td>#01 – 29/11/2023</td><td>R$ 129,90</td></tr>
    <tr><td>#01 #02 #03 #04</td><td>datas japonesas</td>
      <td>#02 – 11/06/2024</td><td>R$ 129,90</td></tr></table>"""

    parsed = parse_bbm_page(html, "Obra em volumes compilados")

    assert [volume["number"] for volume in parsed["volumes"]] == [1, 2]
    assert [volume["release_date"] for volume in parsed["volumes"]] == [
        "29/11/2023",
        "11/06/2024",
    ]
    assert parsed["volume_parse_complete"] is True


def test_parser_infers_brazilian_volume_sequence_from_grouped_release_rows():
    html = """<table><tr><th>Vol.</th><th>Japão</th><th>Brasil</th><th>Preço</th></tr>
    <tr><td>#01 #02 #03 #04 #05 #06</td><td>datas japonesas</td>
      <td>11/05/2026</td><td>R$ 99,90</td></tr>
    <tr><td>#01 #02 #03 #04 #05 #06</td><td>datas japonesas</td>
      <td>18/06/2026</td><td>R$ 99,90</td></tr>
    <tr><td>#01 #02 #03 #04 #05 #06</td><td>datas japonesas</td>
      <td>18/06/2026</td><td>R$ 99,90</td></tr></table>"""

    parsed = parse_bbm_page(html, "Obra compilada em grupos")

    assert [volume["number"] for volume in parsed["volumes"]] == [1, 2]
    assert [volume["release_date"] for volume in parsed["volumes"]] == [
        "11/05/2026",
        "18/06/2026",
    ]
    assert parsed["volume_parse_complete"] is True


def test_parser_extracts_variant_name_from_brazil_release_cell():
    html = """<table><tr><th>Vol.</th><th>Japão</th><th>Brasil</th><th>Preço</th></tr>
    <tr><td>#01</td><td>04/12/2020</td><td>Capa Comum: 13/05/2022</td><td>R$ 34,90</td></tr>
    <tr><td>#01</td><td>04/12/2020</td><td>Capa Variante: 13/05/2022</td><td>R$ 42,90</td></tr></table>"""

    parsed = parse_bbm_page(html, "Obra com capa variante")
    volume = parsed["volumes"][0]

    assert volume["release_date"] == "13/05/2022"
    assert volume["price_amount"] == Decimal("34.90")
    assert volume["variants"][0]["name"] == "Capa Variante"
    assert volume["variants"][0]["price_amount"] == Decimal("42.90")
    assert parsed["volume_parse_complete"] is True


def test_parser_ignores_jojo_part_headings_inside_volume_table():
    html = """<table><tr><th>Vol.</th><th>Japão</th><th>Brasil</th><th>Preço</th></tr>
    <tr><td>#01</td><td>15/02/2002</td><td>07/2018</td><td>R$ 29,90</td></tr>
    <tr><td>BATTLE TENDENCY</td><td>PARTE 2: BATTLE TENDENCY</td>
      <td>PARTE 2: BATTLE TENDENCY</td><td>PARTE 2: BATTLE TENDENCY</td></tr>
    <tr><td>#02</td><td>15/02/2002</td><td>09/2018</td><td>R$ 29,90</td></tr></table>"""

    parsed = parse_bbm_page(html, "JoJo's Bizarre Adventure")

    assert [volume["number"] for volume in parsed["volumes"]] == [1, 2]
    assert parsed["conflicting_volume_numbers"] == []
    assert parsed["volume_parse_complete"] is True


def test_parser_starts_a_separate_publication_for_each_manga_part():
    html = """<table><tr><th>Vol.</th><th>Brasil</th><th>Preço</th></tr>
    <tr><td colspan="3">PARTE 1 – PHANTOM BLOOD</td></tr>
    <tr><td>#01</td><td>07/2018</td><td>R$ 29,90</td></tr>
    <tr><td>#02</td><td>09/2018</td><td>R$ 29,90</td></tr>
    <tr><td colspan="3">PARTE 2: BATTLE TENDENCY</td></tr>
    <tr><td>#01</td><td>12/2026</td><td>R$ 46,90</td></tr>
    <tr><td>#01</td><td>Ed. Especial: 12/2026</td><td>R$ 99,90</td></tr>
    <tr><td>#02</td><td>01/2027</td><td>R$ 46,90</td></tr></table>"""

    parsed = parse_bbm_page(html, "JoJo's Bizarre Adventure")

    parts = [
        publication
        for publication in parsed["publications"]
        if publication["name"].startswith("PARTE")
    ]
    assert len(parts) == 2
    assert [len(publication["volumes"]) for publication in parts] == [2, 2]
    part_two_volume_one = parts[1]["volumes"][0]
    assert part_two_volume_one["variants"][0]["name"] == "Ed. Especial"
    assert parsed["conflicting_volume_numbers"] == []
    assert parsed["volume_parse_complete"] is True


def test_parser_uses_declared_brazilian_volume_count_when_html_has_no_volume_table():
    html = """<p>Título nacional: As Aventuras Elétricas de Pikachu</p>
    <p>Volumes no Brasil: 4*</p><p>Formato: 17 x 26 cm</p>
    <p>Foram publicados quatro volumes em formato de revista.</p>
    <p>Preço: R$ 2,50</p>"""

    parsed = parse_bbm_page(html, "As Aventuras Elétricas de Pikachu")

    assert [volume["number"] for volume in parsed["volumes"]] == [1, 2, 3, 4]
    assert all(
        volume["price_amount"] == Decimal("2.50") for volume in parsed["volumes"]
    )
    assert parsed["publications"][0]["format_type"] == "other"
    assert parsed["publications"][0]["format_label"] == "Revista"
    assert parsed["volume_parse_complete"] is True


def test_parser_uses_single_volume_schedule_without_a_volume_column():
    html = """<p>Nº de volumes no Brasil: 1</p><p>Preço: R$ 15,90</p>
    <table><tr><th>Data no Japão</th><th>Data no Brasil</th><th>Preço</th></tr>
    <tr><td>10/09/2012</td><td>Julho de 2016</td><td>R$ 15,90</td></tr></table>"""

    parsed = parse_bbm_page(html, "The Wedding Eve")

    assert len(parsed["volumes"]) == 1
    assert parsed["volumes"][0]["release_date"] == "07/2016"
    assert parsed["volumes"][0]["price_amount"] == Decimal("15.90")
    assert parsed["volume_parse_complete"] is True


def test_parser_recognizes_bbm_genre_index_pages_as_non_volume_catalog_entries():
    parsed = parse_bbm_page('<p>[child_pages cols="2"]</p>', "Yuri")

    assert parsed["catalog_index_page"] is True
    assert parsed["volumes"] == []
    assert parsed["volume_parse_complete"] is True


def test_metadata_table_does_not_mask_single_volume_table():
    html = """<table>
      <tr><td>Nº de volumes no Brasil: 1</td><td></td></tr>
      <tr><td>Sinopse da obra</td></tr>
    </table>
    <table>
      <tr><th>Vol</th><th>Data no Japão</th><th>Data no Brasil</th><th>Preço</th></tr>
      <tr><td>Único</td><td>30/06/2010</td><td>Julho de 2013</td><td>R$ 17,90</td></tr>
    </table>"""

    parsed = parse_bbm_page(html, "A Arte da Guerra")

    assert parsed["volume_table_found"] is True
    assert parsed["volume_rows_skipped"] == 0
    assert parsed["volume_parse_complete"] is True
    assert len(parsed["volumes"]) == 1
    assert parsed["volumes"][0]["number"] == 1
    assert parsed["volumes"][0]["release_date"] == "07/2013"
    assert parsed["volumes"][0]["price_amount"] == Decimal("17.90")


def test_parser_does_not_assume_panini_for_unknown_publisher():
    parsed = parse_bbm_page("<p>Editora: Devir</p>", "Obra de teste")
    assert parsed["publisher"] == "Devir"

    parsed_without_publisher = parse_bbm_page(
        "<p>Sem editora informada</p>", "Outra obra"
    )
    assert parsed_without_publisher["publisher"] == "Não informada"
    assert parsed_without_publisher["volume_parse_complete"] is False


def test_parser_reads_brazilian_publisher_when_colon_is_on_next_line():
    html = """<p>Editora brasileira<br />: Panini</p>
    <p>Editora original<br />: Shueisha</p>"""

    parsed = parse_bbm_page(html, "Obra de teste")

    assert parsed["publisher"] == "Panini"
    assert parse_bbm_publisher(html) == "Panini"


def test_parser_does_not_treat_prepublication_magazine_as_brazilian_publisher():
    html = """<p>Pré-publicação<br />: Afternoon</p>
    <p>Editora original<br />: Kodansha</p>
    <p>Editora brasileira<br />: Panini</p>"""

    assert parse_bbm_publisher(html) == "Panini"


def test_parser_keeps_publisher_unknown_when_only_prepublication_is_present():
    html = (
        "<p>Pré-publicação<br />: Afternoon</p><p>Editora original<br />: Kodansha</p>"
    )

    assert parse_bbm_publisher(html) == "Não informada"


def test_parser_deduplicates_identical_volume_rows():
    html = """<table><tr><th>Volume</th><th>Brasil</th><th>Preço</th></tr>
    <tr><td>15</td><td>02/12/2023</td><td>R$ 36,90</td></tr>
    <tr><td>15</td><td>02/12/2023</td><td>R$ 36,90</td></tr></table>"""

    parsed = parse_bbm_page(html, "Obra de teste")

    assert len(parsed["volumes"]) == 1
    assert parsed["duplicate_volume_rows"] == 1
    assert parsed["conflicting_volume_numbers"] == []
    assert parsed["volume_parse_complete"] is True


def test_parser_marks_conflicting_duplicate_volume_rows_incomplete():
    html = """<table><tr><th>Volume</th><th>Brasil</th><th>Preço</th></tr>
    <tr><td>27</td><td>15/01/2025</td><td>R$ 40,90</td></tr>
    <tr><td>27</td><td>18/01/2025</td><td>R$ 49,90</td></tr></table>"""

    parsed = parse_bbm_page(html, "Obra de teste")

    assert len(parsed["volumes"]) == 1
    assert parsed["conflicting_volume_numbers"] == [27]
    assert parsed["volume_parse_complete"] is False
    assert parsed["volumes"][0]["variants"][0]["name"].startswith(
        "Variação não identificada"
    )


def test_parser_accepts_volume_rows_without_release_date_or_price_columns():
    html = """<table><tr><th>Volume</th><th>Observação</th></tr>
    <tr><td>1</td><td>Disponível</td></tr>
    <tr><td>2</td><td>Pré-venda</td></tr></table>"""

    parsed = parse_bbm_page(html, "Obra sem preço ou data")

    assert parsed["volume_table_found"] is True
    assert parsed["volume_parse_complete"] is True
    assert [volume["number"] for volume in parsed["volumes"]] == [1, 2]
    assert all(volume["price_amount"] is None for volume in parsed["volumes"])
    assert all(volume["release_date"] is None for volume in parsed["volumes"])


def test_parser_attaches_special_editions_as_variants_of_the_same_volume():
    html = """<table>
    <tr><th>Vol.</th><th>Japão</th><th>Brasil</th><th>Preço</th><th>Compre em</th></tr>
    <tr><td>#15</td><td>17/08/2021</td><td>02/12/2023</td><td>R$ 36,90</td><td>Amazon</td></tr>
    <tr><td>#15</td><td>– capa variante –</td><td>02/12/2023</td><td>R$ 36,90</td><td>Amazon</td></tr>
    <tr><td>#27</td><td>15/12/2023</td><td>15/01/2025</td><td>R$ 40,90</td><td>Panini</td></tr>
    <tr><td>#27</td><td>– Blind Pack –</td><td>18/01/2025</td><td>R$ 49,90</td><td>Panini</td></tr>
    </table>"""

    parsed = parse_bbm_page(html, "Blue Lock")

    assert parsed["volume_parse_complete"] is True
    assert parsed["conflicting_volume_numbers"] == []
    assert len(parsed["volumes"]) == 2
    volume_15, volume_27 = parsed["volumes"]
    assert volume_15["release_date"] == "02/12/2023"
    assert volume_15["price_amount"] == Decimal("36.90")
    assert volume_15["variants"][0]["name"] == "capa variante"
    assert volume_15["variants"][0]["release_date"] == "02/12/2023"
    assert volume_27["price_amount"] == Decimal("40.90")
    assert volume_27["variants"][0]["name"] == "Blind Pack"
    assert volume_27["variants"][0]["release_date"] == "18/01/2025"
    assert volume_27["variants"][0]["price_amount"] == Decimal("49.90")


def test_parser_separates_publications_and_detects_two_in_one_from_source_link():
    html = """
    <div class="entry-content">
      <p><strong>2&ordf; Publica&ccedil;&atilde;o</strong></p>
      <p><strong>Formato</strong>: 13,7 x 20 cm</p>
      <p><strong>Preço</strong>: R$ 49,90</p>
      <table><tr><td>Vol.</td><td>Japão</td><td>Brasil</td><td>Preço</td><td>Compre em</td></tr>
        <tr><td># 01</td><td>2012</td><td>05/05/2024</td><td>R$ 49,90</td>
          <td><a href="https://loja.test/mob-psycho-100-2-em-1-vol-1">Loja</a></td></tr>
      </table>
      <p><strong>1&ordf; Publica&ccedil;&atilde;o</strong></p>
      <p><strong>Formato</strong>: 13,7 x 20 cm</p>
      <table><tr><td>Vol.</td><td>Japão</td><td>Brasil</td><td>Preço</td><td>Compre em</td></tr>
        <tr><td># 01</td><td>2012</td><td>11/2017</td><td>R$ 19,90</td><td><a href="https://loja.test/mob-psycho-vol-1">Loja</a></td></tr>
      </table>
    </div>
    """

    parsed = parse_bbm_page(html, "Mob Psycho 100")

    assert parsed["volume_parse_complete"] is True
    assert len(parsed["publications"]) == 2
    two_in_one, regular_publication = parsed["publications"]
    assert two_in_one["name"] == "2ª Publicação"
    assert two_in_one["format_type"] == "two_in_one"
    assert two_in_one["format_label"] == "2 em 1"
    assert two_in_one["volumes_per_book"] == 2
    assert two_in_one["format_details"] == "13,7 x 20 cm"
    assert two_in_one["volumes"][0]["price_amount"] == Decimal("49.90")
    assert regular_publication["name"] == "1ª Publicação"
    assert regular_publication["format_type"] == "unknown"
    assert regular_publication["volumes"][0]["price_amount"] == Decimal("19.90")
