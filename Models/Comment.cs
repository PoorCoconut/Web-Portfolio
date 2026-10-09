using System;
namespace MyWebPortfolio.Models
{
    public class Comment
    {
        public int Id { get; set; }
        public string Message { get; set; } = string.Empty;
        public DateTime PostedAt { get; set; }

        public void EditMessage()
        {
            throw new NotImplementedException();
        }
    }
}
