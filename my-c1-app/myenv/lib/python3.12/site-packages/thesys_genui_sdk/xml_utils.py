import html
from enum import Enum
from typing import Dict, Optional


class C1XMLTags(Enum):
    THINK_ITEM = "thinkitem"
    THINK_ITEM_TITLE = "thinkitemtitle"
    THINK_ITEM_CONTENT = "thinkitemcontent"
    CUSTOM_MARKDOWN = "custommarkdown"


class TagUtils:
    @staticmethod
    def open_tag(tag: str, attrs: Optional[Dict[str, str]] = None) -> str:
        """Create an opening XML tag with optional attributes."""
        attr_string = ""
        if attrs:
            attr_string = " " + " ".join(
                [f'{key}="{value}"' for key, value in attrs.items()]
            )
        return f"<{tag}{attr_string}>"

    @staticmethod
    def close_tag(tag: str) -> str:
        """Create a closing XML tag."""
        return f"</{tag}>"


def escape(content: str) -> str:
    """Escape HTML content."""
    return html.escape(content)


def wrap_custom_markdown(content: str) -> str:
    """Wrap content in custom markdown tags."""
    tag = C1XMLTags.CUSTOM_MARKDOWN.value
    return f"{TagUtils.open_tag(tag)}{escape(content)}{TagUtils.close_tag(tag)}"


def wrap_think_item(title: str, content: str, ephemeral: Optional[bool] = None) -> str:
    """Wrap title and content in think item tags."""
    title_el = (
        f"{TagUtils.open_tag(C1XMLTags.THINK_ITEM_TITLE.value)}"
        f"{escape(title)}"
        f"{TagUtils.close_tag(C1XMLTags.THINK_ITEM_TITLE.value)}"
    )

    content_el = (
        f"{TagUtils.open_tag(C1XMLTags.THINK_ITEM_CONTENT.value)}"
        f"{escape(content)}"
        f"{TagUtils.close_tag(C1XMLTags.THINK_ITEM_CONTENT.value)}"
    )

    attrs = {"ephemeral": "true"} if ephemeral else None

    return (
        f"{TagUtils.open_tag(C1XMLTags.THINK_ITEM.value, attrs)}"
        f"{title_el}"
        f"{content_el}"
        f"{TagUtils.close_tag(C1XMLTags.THINK_ITEM.value)}"
    )
