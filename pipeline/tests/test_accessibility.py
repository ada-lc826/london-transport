from mind_the_step.accessibility import find_accessibility_links

PAGE = """
<a href="/cdn/static/cms/documents/step-free-access-and-toilet-data-guide.pdf">Guide</a>
<a href="https://content.tfl.gov.uk/station-topology-gtfs.zip">Station topology files (GTFS)</a>
<a href="https://content.tfl.gov.uk/detailed-files.zip">Station topology files (detailed)</a>
<a href="https://content.tfl.gov.uk/detailed-files.zip">duplicate</a>
<a href="https://content.tfl.gov.uk/bus-sequences.csv">Bus sequences</a>
<a href="/info-for/accessibility">Accessibility page</a>
<a href="https://evil.example/step-free.zip">Step-free elsewhere</a>
<a href="http://content.tfl.gov.uk/lrad-v2.xml">Insecure</a>
"""


def test_keeps_tfl_accessibility_files_only():
    links = find_accessibility_links(PAGE)
    assert [link["url"] for link in links] == [
        "https://tfl.gov.uk/cdn/static/cms/documents/step-free-access-and-toilet-data-guide.pdf",
        "https://content.tfl.gov.uk/station-topology-gtfs.zip",
        "https://content.tfl.gov.uk/detailed-files.zip",
    ]
    # Matched on link text when the file name says nothing.
    assert links[2]["text"] == "Station topology files (detailed)"
