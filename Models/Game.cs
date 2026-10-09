namespace MyWebPortfolio.Models
{
    // INHERITED CLASSES
    public class Game : Project
    {
        public string Engine { get; set; } = string.Empty;
        public string Genre { get; set; } = string.Empty;
        public string ItchIoUrl { get; set; } = string.Empty;
    }
}
