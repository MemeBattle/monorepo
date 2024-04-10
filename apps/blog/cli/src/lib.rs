pub mod arguments;

use arguments::CreateCommandArguments;
use edit::{edit_file, Builder};
use miette::Diagnostic;
use owo_colors::{OwoColorize, Style};
use std::{
    fs,
    io::Write,
    path::{self, PathBuf},
};

#[derive(Debug, thiserror::Error, Diagnostic)]
pub enum MemsPostError {
    #[error(transparent)]
    #[diagnostic(code(mems_post::write::io_error))]
    IoError(#[from] std::io::Error),

    #[error("Failed to create temporary file: {0}")]
    #[diagnostic(code(mems_post::create::temp_file_create_error))]
    TempFileCreateError(std::io::Error),

    #[error("failed to keep tempfile: {0}")]
    #[diagnostic(code(mems_post::write::tempfile_keep_error))]
    TempFileKeepError(#[from] tempfile::PersistError),

    #[error("unable to read tempfile after passing edit control to user:\ntempfile: {filepath} \nerror: {io_error}")]
    #[diagnostic(
        code(mems_post::write::tempfile_read_error),
        help("Make sure your editor isn't moving the file away from the temporary location")
    )]
    TempFileReadError {
        filepath: path::PathBuf,
        io_error: std::io::Error,
    },
}

fn build_template(arguments: &CreateCommandArguments) -> String {
    let CreateCommandArguments {
        title,
        published_at,
        summary,
        image,
        tags,
        author,
    } = arguments;

    let mut template = String::new();

    template.push_str("---\n");
    if let Some(title) = title {
        template.push_str(&format!("title: {}\n", title));
    }
    if let Some(published_at) = published_at {
        template.push_str(&format!("published_at: {}\n", published_at));
    }
    if let Some(summary) = summary {
        template.push_str(&format!("summary: {}\n", summary));
    }
    if let Some(image) = image {
        template.push_str(&format!("image: {}\n", image));
    }
    if let Some(tags) = tags {
        template.push_str(&format!("tags: [{}]\n", tags.join(", ")));
    }
    if let Some(author) = author {
        template.push_str(&format!("author: {}\n", author));
    }
    template.push_str("---\n");

    template
}

fn extract_title_from_content(content: String) -> Option<String> {
    for line in content.lines() {
        if line.starts_with("title: ") {
            return Some(line.replace("title: ", ""));
        }
    }
    None
}

fn ask_for_filename() -> miette::Result<String, MemsPostError> {
    rprompt::prompt_reply(
        "Enter a filename:
> "
        .if_supports_color(owo_colors::Stream::Stdout, |text| {
            text.style(Style::new().blue().bold())
        }),
    )
    .map_err(Into::into)
}

fn confirm_filename(raw_title: &str) -> miette::Result<String, MemsPostError> {
    loop {
        let result = rprompt::prompt_reply(&format!(
            "Confirm title: {} ({}/n)\n",
            &raw_title.if_supports_color(owo_colors::Stream::Stdout, |text| {
                text.style(Style::new().green().bold())
            }),
            "Y".if_supports_color(owo_colors::Stream::Stdout, |text| {
                text.style(Style::new().bold())
            }),
        ))?;

        match result.as_str() {
            "y" | "Y" | "" => break Ok(raw_title.to_string()),
            "n" | "N" => break ask_for_filename(),
            _ => continue,
        }
    }
}

pub fn create(
    path: String,
    arguments: CreateCommandArguments,
) -> miette::Result<(), MemsPostError> {
    let path = PathBuf::from(path);

    let (mut file, filepath) = Builder::new()
        .suffix(".md")
        .rand_bytes(5)
        .tempfile_in(&path)
        .map_err(MemsPostError::TempFileCreateError)?
        .keep()?;

    let template = build_template(&arguments);
    file.write_all(template.as_bytes())?;
    edit_file(&filepath)?;

    let content =
        std::fs::read_to_string(&filepath).map_err(|e| MemsPostError::TempFileReadError {
            filepath: filepath.clone(),
            io_error: e,
        })?;

    let document_title = extract_title_from_content(content).or(arguments.title.clone());

    let filename = match document_title {
        Some(title) => confirm_filename(&title),
        None => ask_for_filename(),
    }
    .map(slug::slugify)?;

    for attempt in 0.. {
        let mut dest = path.join(if attempt == 0 {
            filename.clone()
        } else {
            format!("{filename}{:03}", -attempt)
        });
        dest.set_extension("md");

        if dest.exists() {
            continue;
        }

        fs::rename(filepath, &dest)?;
        break;
    }

    Ok(())
}

#[cfg(test)]
mod test {
    use super::*;

    #[test]
    fn test_extract_title_from_content() {
        let content = String::from("title: Hello World\n");
        let title = extract_title_from_content(content);
        assert_eq!(title, Some(String::from("Hello World")));
    }
}
