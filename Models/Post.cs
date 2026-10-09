namespace MyWebPortfolio.Models
{
    //STANDALONE CLASS
    public class Post
    {
        public int Id { get; set; }
        public string Title { get; set; } = string.Empty;
        public string Content { get; set; } = string.Empty;
        public int LikeCount { get; set; }
    }
}
