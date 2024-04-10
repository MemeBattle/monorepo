use clap::{Parser, Subcommand};

/// A cli for management of meme-battle-blog-posts
#[derive(Debug, Parser)]
#[clap(version)]
pub struct Arguments {
    #[clap(short, long, env, default_value = ".")]
    pub dir: String,

    #[clap(subcommand)]
    pub command: Command,
}

#[derive(Debug, Subcommand)]
pub enum Command {
    /// Command to create a new post with predefined tags
    Create(CreateCommandArguments),
}

#[derive(Debug, Parser)]
pub struct CreateCommandArguments {
    #[clap(short, long)]
    pub title: Option<String>,
    #[clap(short, long)]
    pub published_at: Option<String>,
    #[clap(short, long)]
    pub summary: Option<String>,
    #[clap(short, long)]
    pub image: Option<String>,
    #[clap(long)]
    pub tags: Option<Vec<String>>,
    #[clap(short, long)]
    pub author: Option<String>,
}
