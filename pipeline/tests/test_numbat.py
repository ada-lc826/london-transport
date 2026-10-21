from mind_the_step.numbat import parse_listing

PAGE = b"""<?xml version="1.0" encoding="UTF-8"?>
<ListBucketResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/">
  <Name>crowding</Name><Prefix>NUMBAT</Prefix><IsTruncated>true</IsTruncated>
  <Contents><Key>NUMBAT/NBT23MTT_outputs.xlsx</Key><Size>123</Size>
    <LastModified>2024-05-01T00:00:00.000Z</LastModified></Contents>
  <Contents><Key>NUMBAT/NBT23FRI_outputs.xlsx</Key><Size>45</Size></Contents>
</ListBucketResult>"""


def test_parse_listing_reads_keys_and_the_next_marker():
    items, marker = parse_listing(PAGE)
    assert [(i["key"], i["size"]) for i in items] == [
        ("NUMBAT/NBT23MTT_outputs.xlsx", 123),
        ("NUMBAT/NBT23FRI_outputs.xlsx", 45),
    ]
    # No NextMarker in a v1 listing: continue from the last key.
    assert marker == "NUMBAT/NBT23FRI_outputs.xlsx"


def test_parse_listing_last_page_has_no_marker():
    last = PAGE.replace(b"<IsTruncated>true", b"<IsTruncated>false")
    assert parse_listing(last)[1] is None
