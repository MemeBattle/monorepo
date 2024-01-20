use clap::Parser;
use miette::Context;
use meme_battle_post::{
    arguments::{Arguments, Command},
    create,
};

fn main() -> miette::Result<()> {
    let arguments = Arguments::parse();

    match arguments.command {
        Command::Create(options) => create(arguments.dir, options).wrap_err("mems_post::crate"),
    }
}
